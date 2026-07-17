"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { generateContactDiscoveryTargets } from "@/lib/contact-discovery/targets";
import { generateContactSearchQueue, BrainNotReadyError } from "@/lib/contact-discovery/query-generator";
import { processContactResults, type ProcessContactResultsOptions } from "@/lib/contact-discovery/processor";
import { updateContactDiscoveryTargetStatus, ContactDiscoveryTargetNotFoundError } from "@/lib/contact-discovery/service";
import { executeDiscoveryRun, DiscoveryBrainNotReadyError } from "@/lib/discovery-brain/executor";
import type { ContactDiscoveryTargetStatus } from "@/models";

function revalidateContactDiscoveryPaths() {
  revalidatePath("/dashboard/contact-discovery");
  revalidatePath("/dashboard/contacts");
  revalidatePath("/dashboard/discovery-runs");
  revalidatePath("/dashboard/raw-search-results");
  revalidatePath("/dashboard");
}

export type GenerateContactDiscoveryTargetsActionResult =
  | { ok: true; targetsCreated: number; targetsUpdated: number; skipped: number; duplicatesSkipped: number }
  | { ok: false; error: string };

/** "Generate Contact Discovery Targets" — (re)builds the ContactDiscoveryTarget queue from active TargetCustomer/ProjectOpportunity/TenderBuyer/TenderOpportunity/VendorRegistration records. */
export async function generateContactDiscoveryTargetsAction(): Promise<GenerateContactDiscoveryTargetsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to generate contact discovery targets." };
  }

  try {
    const summary = await generateContactDiscoveryTargets(active.workspace.id);
    revalidateContactDiscoveryPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't generate contact discovery targets right now. Please try again." };
  }
}

export type GenerateContactSearchQueueActionResult =
  | { ok: true; queriesCreated: number; queueItemsCreated: number; duplicatesSkipped: number }
  | { ok: false; error: string };

/** "Generate Contact Search Queue" — builds CONTACT-searchType SearchQuery/SearchQueueItem rows for every un-queued ContactDiscoveryTarget. Requires a ready Business Brain, same as the main discovery queue generator. */
export async function generateContactSearchQueueAction(): Promise<GenerateContactSearchQueueActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to generate the contact search queue." };
  }

  try {
    const summary = await generateContactSearchQueue(active.workspace.id);
    revalidateContactDiscoveryPaths();
    return { ok: true, ...summary };
  } catch (error) {
    if (error instanceof BrainNotReadyError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't generate the contact search queue right now. Please try again." };
  }
}

export type RunContactSearchActionResult =
  | { ok: true; discoveryRunId: string; status: "COMPLETED" | "FAILED"; queriesExecuted: number; rawResultsFound: number; duplicatesFound: number; errorsCount: number }
  | { ok: false; error: string };

/** "Run Contact Search" — executes a batch of already-queued CONTACT searches now, via the existing (searchType-agnostic) Phase 6 execution engine. Only fetches raw results; never extracts them. */
export async function runContactSearchAction(maxQueueItems?: number): Promise<RunContactSearchActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to run contact search." };
  }

  try {
    const result = await executeDiscoveryRun(active.workspace.id, { runType: "MANUAL", searchType: "CONTACT", maxQueueItems });
    revalidateContactDiscoveryPaths();
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof DiscoveryBrainNotReadyError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't run contact search right now. Please try again." };
  }
}

export type ProcessContactResultsActionResult =
  | {
      ok: true;
      rawResultsProcessed: number;
      contactsExtracted: number;
      contactsCreated: number;
      contactsUpdated: number;
      duplicatesFound: number;
      skipped: number;
      failed: number;
    }
  | { ok: false; error: string };

/** "Process Contact Results" — turns queued RawSearchResult (searchType=CONTACT) rows into Contact records, linking each back to its originating ContactDiscoveryTarget's related record where possible. */
export async function processContactResultsAction(input: ProcessContactResultsOptions = {}): Promise<ProcessContactResultsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to process contact results." };
  }

  try {
    const summary = await processContactResults(active.workspace.id, input);
    revalidateContactDiscoveryPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't process contact results right now. Please try again." };
  }
}

export type RunPublicContactDiscoveryBatchInput = {
  generateTargets?: boolean;
  generateQueue?: boolean;
  runSearch?: boolean;
  processResults?: boolean;
  maxQueueItems?: number;
  batchSize?: number;
};

export type RunPublicContactDiscoveryBatchActionResult =
  | {
      ok: true;
      targets?: { targetsCreated: number; targetsUpdated: number; skipped: number; duplicatesSkipped: number };
      queue?: { queriesCreated: number; queueItemsCreated: number; duplicatesSkipped: number };
      search?: { discoveryRunId: string; status: "COMPLETED" | "FAILED"; queriesExecuted: number; rawResultsFound: number; duplicatesFound: number; errorsCount: number };
      processing?: {
        rawResultsProcessed: number;
        contactsExtracted: number;
        contactsCreated: number;
        contactsUpdated: number;
        duplicatesFound: number;
        skipped: number;
        failed: number;
      };
      warnings: string[];
    }
  | { ok: false; error: string };

/**
 * "Run Public Contact Discovery Batch" — the one-click composite action:
 * optionally (re)generates targets, generates the search queue, runs queued
 * CONTACT searches, and processes raw results into Contacts, in that order.
 * Each step is independently toggleable (and independently callable via the
 * dedicated actions above) — a step that fails or is skipped doesn't block
 * the ones after it; failures are collected as warnings rather than aborting
 * the whole batch, since e.g. an empty search queue on a fresh workspace is
 * an expected, non-fatal outcome of running this before any targets exist.
 */
export async function runPublicContactDiscoveryBatchAction(
  input: RunPublicContactDiscoveryBatchInput = {},
): Promise<RunPublicContactDiscoveryBatchActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to run public contact discovery." };
  }

  const warnings: string[] = [];
  const result: RunPublicContactDiscoveryBatchActionResult = { ok: true, warnings };

  if (input.generateTargets !== false) {
    try {
      result.targets = await generateContactDiscoveryTargets(active.workspace.id);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Couldn't generate contact discovery targets.");
    }
  }

  if (input.generateQueue !== false) {
    try {
      result.queue = await generateContactSearchQueue(active.workspace.id);
    } catch (error) {
      if (error instanceof BrainNotReadyError) warnings.push(error.message);
      else warnings.push("Couldn't generate the contact search queue.");
    }
  }

  if (input.runSearch !== false) {
    try {
      result.search = await executeDiscoveryRun(active.workspace.id, {
        runType: "MANUAL",
        searchType: "CONTACT",
        maxQueueItems: input.maxQueueItems,
      });
    } catch (error) {
      if (error instanceof DiscoveryBrainNotReadyError) warnings.push(error.message);
      else warnings.push("Couldn't run contact search.");
    }
  }

  if (input.processResults !== false) {
    try {
      result.processing = await processContactResults(active.workspace.id, { batchSize: input.batchSize });
    } catch {
      warnings.push("Couldn't process contact results.");
    }
  }

  revalidateContactDiscoveryPaths();
  return result;
}

export type ContactDiscoveryTargetActionResult = { ok: true } | { ok: false; error: string };

/** "Update ContactDiscoveryTarget Status" — mostly for manually archiving a target you don't want searched again. */
export async function updateContactDiscoveryTargetStatusAction(id: string, status: ContactDiscoveryTargetStatus): Promise<ContactDiscoveryTargetActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contact discovery targets." };
  }

  try {
    await updateContactDiscoveryTargetStatus(active.workspace.id, id, status);
    revalidateContactDiscoveryPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactDiscoveryTargetNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact discovery target right now. Please try again." };
  }
}
