"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { processCustomerResults, type ProcessCustomerResultsOptions } from "@/lib/customers/processor";
import { updateCustomerStatus, CustomerNotFoundError } from "@/lib/customers/service";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { recordFeedback, BrainFeedbackTargetError } from "@/lib/business-brain/service";
import { dbConnect } from "@/lib/mongodb";
import { TargetCustomer as TargetCustomerModel } from "@/models";
import type { TargetCustomerStatus } from "@/models";

function revalidateCustomerPaths() {
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/discovery-runs");
  revalidatePath("/dashboard/raw-search-results");
  revalidatePath("/dashboard");
}

export type ProcessCustomerResultsActionResult =
  | { ok: true; rawResultsProcessed: number; customersCreated: number; customersUpdated: number; skipped: number; failed: number }
  | { ok: false; error: string };

/** "Process Customer Results" — turns queued RawSearchResult (searchType=CUSTOMER) rows into TargetCustomer records. */
export async function processCustomerResultsAction(
  input: ProcessCustomerResultsOptions = {},
): Promise<ProcessCustomerResultsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to process customer results." };
  }

  try {
    enforceRateLimit(active.workspace.id, "process_extraction");
    const summary = await processCustomerResults(active.workspace.id, input);
    revalidateCustomerPaths();
    return { ok: true, ...summary };
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't process customer results right now. Please try again." };
  }
}

export type UpdateCustomerStatusActionResult = { ok: true } | { ok: false; error: string };

export async function updateCustomerStatusAction(
  id: string,
  status: TargetCustomerStatus,
): Promise<UpdateCustomerStatusActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update customers." };
  }

  try {
    await updateCustomerStatus(active.workspace.id, id, status);
    revalidateCustomerPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof CustomerNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that customer right now. Please try again." };
  }
}

export type CustomerFeedbackKind = "GOOD_FIT" | "BAD_FIT" | "NEEDS_REVIEW";

/**
 * Mark Good Fit / Bad Fit / Needs Review. Good/Bad Fit map onto the existing
 * BrainFeedback vocabulary (GOOD_LEAD/BAD_LEAD) since they're the same
 * concept as the older TargetCompany feedback loop — full dedup/feedback
 * scoring integration is future work (see PROJECT_STATUS.md). Needs Review
 * has no compatible BrainFeedback type, so it's just a status change.
 */
export async function recordCustomerFeedbackAction(
  id: string,
  kind: CustomerFeedbackKind,
): Promise<UpdateCustomerStatusActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to give feedback on customers." };
  }

  await dbConnect();
  const customer = await TargetCustomerModel.findOne({ _id: id, workspaceId: active.workspace.id });
  if (!customer) {
    return { ok: false, error: "That customer doesn't exist in this workspace." };
  }

  if (kind === "NEEDS_REVIEW") {
    customer.status = "REVIEWED";
    await customer.save();
    revalidateCustomerPaths();
    return { ok: true };
  }

  try {
    await recordFeedback(active.workspace.id, session.user.id, {
      feedbackType: kind === "GOOD_FIT" ? "GOOD_LEAD" : "BAD_LEAD",
      subjectLabel: customer.customerName,
    });
  } catch (error) {
    // No Business Brain yet — still safe to record the status change, just without the brain-feedback signal.
    if (!(error instanceof BrainFeedbackTargetError)) throw error;
  }

  customer.status = kind === "GOOD_FIT" ? "APPROVED" : "REJECTED";
  await customer.save();
  revalidateCustomerPaths();
  return { ok: true };
}
