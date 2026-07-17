"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { processTenderResults, type ProcessTenderResultsOptions } from "@/lib/tenders/processor";
import { updateTenderBuyerStatus, TenderBuyerNotFoundError } from "@/lib/tenders/buyer-service";
import { updateTenderOpportunityStatus, TenderOpportunityNotFoundError } from "@/lib/tenders/opportunity-service";
import { updateExpiredTenders } from "@/lib/tenders/expiry";
import type { TenderBuyerStatus, TenderOpportunityStatus } from "@/models";

function revalidateTenderPaths() {
  revalidatePath("/dashboard/tender-buyers");
  revalidatePath("/dashboard/live-tenders");
  revalidatePath("/dashboard/duplicates");
  revalidatePath("/dashboard/discovery-runs");
  revalidatePath("/dashboard/raw-search-results");
  revalidatePath("/dashboard");
}

export type ProcessTenderResultsActionResult =
  | {
      ok: true;
      rawResultsProcessed: number;
      tenderBuyersCreated: number;
      tenderBuyersUpdated: number;
      tenderOpportunitiesCreated: number;
      tenderOpportunitiesUpdated: number;
      skipped: number;
      failed: number;
      duplicatesFound: number;
      autoMerged: number;
      pendingReview: number;
    }
  | { ok: false; error: string };

/** "Process Tender Results" — turns queued RawSearchResult (searchType=TENDER) rows into TenderBuyer and/or TenderOpportunity records. */
export async function processTenderResultsAction(
  input: ProcessTenderResultsOptions = {},
): Promise<ProcessTenderResultsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to process tender results." };
  }

  try {
    const summary = await processTenderResults(active.workspace.id, input);
    revalidateTenderPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't process tender results right now. Please try again." };
  }
}

export type TenderActionResult = { ok: true } | { ok: false; error: string };

export async function updateTenderBuyerStatusAction(id: string, status: TenderBuyerStatus): Promise<TenderActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update tender buyers." };
  }

  try {
    await updateTenderBuyerStatus(active.workspace.id, id, status);
    revalidateTenderPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof TenderBuyerNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that tender buyer right now. Please try again." };
  }
}

export async function updateTenderOpportunityStatusAction(id: string, status: TenderOpportunityStatus): Promise<TenderActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update live tenders." };
  }

  try {
    await updateTenderOpportunityStatus(active.workspace.id, id, status);
    revalidateTenderPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof TenderOpportunityNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that live tender right now. Please try again." };
  }
}

export type UpdateExpiredTendersActionResult = { ok: true; expired: number } | { ok: false; error: string };

/** "Update Expired Tenders" — marks any TenderOpportunity past its endDate (and not already Won/Lost/Submitted/Archived) as Expired. Never deletes anything. */
export async function updateExpiredTendersAction(): Promise<UpdateExpiredTendersActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update tender statuses." };
  }

  try {
    const summary = await updateExpiredTenders(active.workspace.id);
    revalidateTenderPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't update expired tenders right now. Please try again." };
  }
}
