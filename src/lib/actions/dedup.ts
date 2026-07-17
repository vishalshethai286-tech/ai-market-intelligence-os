"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { runCustomerDeduplication } from "@/lib/dedup/customer-service";
import { runProjectDeduplication } from "@/lib/dedup/project-service";
import { runTenderBuyerDeduplication } from "@/lib/dedup/tender-buyer-service";
import { runTenderOpportunityDeduplication } from "@/lib/dedup/tender-opportunity-service";
import { runVendorRegistrationDeduplication } from "@/lib/dedup/vendor-registration-service";
import { resolveDuplicateRecordWithoutMerge, DuplicateRecordNotFoundError, DuplicateRecordNotPendingError } from "@/lib/dedup/service";
import { mergeRecords, MergeTargetNotFoundError, UnsupportedRecordTypeError } from "@/lib/dedup/merge";
import { dbConnect } from "@/lib/mongodb";
import { DuplicateRecord as DuplicateRecordModel } from "@/models";
import type { DedupRecordType } from "@/models";

function revalidateDuplicatePaths() {
  revalidatePath("/dashboard/duplicates");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/tender-buyers");
  revalidatePath("/dashboard/live-tenders");
  revalidatePath("/dashboard/vendor-registrations");
  revalidatePath("/dashboard");
}

const SUPPORTED_DEDUP_RECORD_TYPES: readonly DedupRecordType[] = [
  "CUSTOMER",
  "PROJECT",
  "TENDER_BUYER",
  "TENDER_OPPORTUNITY",
  "VENDOR_REGISTRATION",
];

export type RunDeduplicationInput = {
  recordType?: DedupRecordType;
  mode?: "SCAN_ALL" | "RECENT_ONLY";
};

export type RunDeduplicationActionResult =
  | { ok: true; recordsScanned: number; duplicatesFound: number; autoMerged: number; pendingReview: number; errors: number }
  | { ok: false; error: string };

/** "Run Deduplication" — CUSTOMER, PROJECT, TENDER_BUYER, TENDER_OPPORTUNITY, and VENDOR_REGISTRATION are all implemented as of Phase 11. */
export async function runDeduplicationAction(input: RunDeduplicationInput = {}): Promise<RunDeduplicationActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to run deduplication." };
  }

  const recordType = input.recordType ?? "CUSTOMER";
  if (!SUPPORTED_DEDUP_RECORD_TYPES.includes(recordType)) {
    return { ok: false, error: `Deduplication for ${recordType} isn't implemented yet — only ${SUPPORTED_DEDUP_RECORD_TYPES.join(", ")} are supported so far.` };
  }

  try {
    let summary;
    if (recordType === "PROJECT") summary = await runProjectDeduplication(active.workspace.id, { mode: input.mode });
    else if (recordType === "TENDER_BUYER") summary = await runTenderBuyerDeduplication(active.workspace.id, { mode: input.mode });
    else if (recordType === "TENDER_OPPORTUNITY") summary = await runTenderOpportunityDeduplication(active.workspace.id, { mode: input.mode });
    else if (recordType === "VENDOR_REGISTRATION") summary = await runVendorRegistrationDeduplication(active.workspace.id, { mode: input.mode });
    else summary = await runCustomerDeduplication(active.workspace.id, { mode: input.mode });

    revalidateDuplicatePaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't run deduplication right now. Please try again." };
  }
}

export type DuplicateActionResult = { ok: true } | { ok: false; error: string };

/** "Merge Duplicate" — validates the pair is still PENDING_REVIEW, then performs a safe merge (never deletes either record). */
export async function mergeDuplicateAction(duplicateRecordId: string): Promise<DuplicateActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };

  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to merge duplicates." };
  }

  await dbConnect();
  const record = await DuplicateRecordModel.findOne({ _id: duplicateRecordId, workspaceId: active.workspace.id });
  if (!record) return { ok: false, error: "That duplicate record doesn't exist in this workspace." };
  if (record.status !== "PENDING_REVIEW") {
    return { ok: false, error: "That duplicate record has already been resolved." };
  }
  try {
    await mergeRecords(active.workspace.id, record.recordType, record.primaryRecordId, record.duplicateRecordId, {
      mergedBy: session.user.id,
      mergeReason: "Manually merged from Duplicate Review",
      duplicateRecordId: record.id,
      duplicateRecordStatus: "MANUALLY_MERGED",
    });
    revalidateDuplicatePaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof MergeTargetNotFoundError) return { ok: false, error: error.message };
    if (error instanceof UnsupportedRecordTypeError) return { ok: false, error: `Merging ${record.recordType} records isn't implemented yet.` };
    return { ok: false, error: "Couldn't merge these records right now. Please try again." };
  }
}

async function resolveWithoutMergeAction(
  duplicateRecordId: string,
  newStatus: "NOT_DUPLICATE" | "REJECTED" | "ARCHIVED",
): Promise<DuplicateActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to review duplicates." };
  }

  try {
    await resolveDuplicateRecordWithoutMerge(active.workspace.id, duplicateRecordId, newStatus);
    revalidateDuplicatePaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateRecordNotFoundError || error instanceof DuplicateRecordNotPendingError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Couldn't update that duplicate record right now. Please try again." };
  }
}

/** "Keep separate / Not Duplicate" — both records stay active, nothing is merged. */
export async function markNotDuplicateAction(duplicateRecordId: string): Promise<DuplicateActionResult> {
  return resolveWithoutMergeAction(duplicateRecordId, "NOT_DUPLICATE");
}

export async function rejectDuplicateAction(duplicateRecordId: string): Promise<DuplicateActionResult> {
  return resolveWithoutMergeAction(duplicateRecordId, "REJECTED");
}

export async function archiveDuplicateAction(duplicateRecordId: string): Promise<DuplicateActionResult> {
  return resolveWithoutMergeAction(duplicateRecordId, "ARCHIVED");
}
