"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { generateDiscoveryQueue, BrainNotReadyError } from "@/lib/discovery-brain/service";
import { executeDiscoveryRun, DiscoveryBrainNotReadyError, type ExecuteDiscoveryRunOptions } from "@/lib/discovery-brain/executor";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import type { SearchType } from "@/models";

export type GenerateDiscoveryQueueActionResult =
  | { ok: true; queriesPlanned: number; queriesCreated: number; queueItemsCreated: number }
  | { ok: false; error: string };

export async function generateDiscoveryQueueAction(): Promise<GenerateDiscoveryQueueActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to generate the discovery queue." };
  }

  try {
    const result = await generateDiscoveryQueue(active.workspace.id);
    revalidatePath("/dashboard/discovery-brain");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof BrainNotReadyError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't generate the discovery queue right now. Please try again." };
  }
}

export type RunDiscoveryNowActionResult =
  | {
      ok: true;
      discoveryRunId: string;
      status: "COMPLETED" | "FAILED";
      queriesExecuted: number;
      rawResultsFound: number;
      duplicatesFound: number;
      errorsCount: number;
    }
  | { ok: false; error: string };

export type RunDiscoveryNowInput = {
  searchType?: SearchType;
  country?: string;
  maxQueueItems?: number;
};

/** Runs a batch of already-queued searches now (manual trigger) — never extracts results, only executes searches and stores raw results. */
export async function runDiscoveryNowAction(input: RunDiscoveryNowInput = {}): Promise<RunDiscoveryNowActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to run discovery." };
  }

  const options: ExecuteDiscoveryRunOptions = {
    runType: "MANUAL",
    searchType: input.searchType,
    country: input.country,
    maxQueueItems: input.maxQueueItems,
  };

  try {
    enforceRateLimit(active.workspace.id, "run_discovery");
    const result = await executeDiscoveryRun(active.workspace.id, options);
    revalidatePath("/dashboard/discovery-brain");
    revalidatePath("/dashboard/discovery-runs");
    revalidatePath("/dashboard/raw-search-results");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof DiscoveryBrainNotReadyError) return { ok: false, error: error.message };
    if (error instanceof RateLimitExceededError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't run discovery right now. Please try again." };
  }
}
