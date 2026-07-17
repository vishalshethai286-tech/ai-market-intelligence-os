import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { UsageLog as UsageLogModel, BusinessBrain as BusinessBrainModel } from "@/models";
import { getBusinessBrain } from "@/lib/business-brain/service";
import {
  generateAndStoreSearchQueries,
  listSearchQueries,
  InsufficientBrainContextError,
} from "@/lib/search-queries/service";
import { discoverAndExtractTargetCompanies } from "@/lib/target-companies/service";
import { scoreAllTargetCompanies } from "@/lib/lead-scoring/service";
import type { SearchProviderName } from "@/lib/search";

/** DISCOVERY_BATCH_SIZE env var, falling back to a sane default if unset/invalid. */
function defaultMaxQueriesPerRun(): number {
  const parsed = Number(process.env.DISCOVERY_BATCH_SIZE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

export type WorkspaceDiscoveryResult = {
  workspaceId: string;
  skipped: boolean;
  reason?: string;
  searchQueriesGenerated: number;
  evaluated: number;
  created: number;
  queriesRun: number;
  scored: number;
};

export type DiscoveryRunOptions = {
  provider?: SearchProviderName;
  maxQueries?: number;
};

/**
 * Runs one continuous-discovery pass for a single workspace: ensures search
 * queries exist (generating them if this is the first run), searches for
 * and extracts target companies against every stored query, then scores
 * every target company so newly-created ones get a priorityScore/Grade
 * immediately rather than waiting for a separate step. Records the run as a
 * UsageLog row (metric: "discovery_run") rather than a new model, following
 * this app's existing metering convention.
 *
 * Never throws for a workspace that isn't ready — a workspace without an
 * ACTIVE/STALE Business Brain, or with a Brain too sparse to ground queries,
 * comes back `skipped: true` with a reason, so a scheduled run across many
 * workspaces doesn't abort on the first one that isn't onboarded yet.
 */
export async function runDiscoveryForWorkspace(
  workspaceId: string,
  options: DiscoveryRunOptions = {},
): Promise<WorkspaceDiscoveryResult> {
  const empty = {
    workspaceId,
    searchQueriesGenerated: 0,
    evaluated: 0,
    created: 0,
    queriesRun: 0,
    scored: 0,
  };

  const brain = await getBusinessBrain(workspaceId);
  if (!brain || brain.status === "INITIALIZING") {
    return { ...empty, skipped: true, reason: "Business Brain isn't built yet." };
  }

  let searchQueriesGenerated = 0;
  const existingQueries = await listSearchQueries(workspaceId);
  if (existingQueries.length === 0) {
    try {
      const result = await generateAndStoreSearchQueries(workspaceId);
      searchQueriesGenerated = result.created;
    } catch (error) {
      if (error instanceof InsufficientBrainContextError) {
        return { ...empty, skipped: true, reason: error.message };
      }
      throw error;
    }
  }

  const discovery = await discoverAndExtractTargetCompanies(workspaceId, {
    provider: options.provider,
    maxQueries: options.maxQueries ?? defaultMaxQueriesPerRun(),
  });

  const scoring = await scoreAllTargetCompanies(workspaceId);

  await dbConnect();
  await UsageLogModel.create({
    workspaceId,
    metric: "discovery_run",
    quantity: discovery.created,
    metadata: {
      searchQueriesGenerated,
      evaluated: discovery.evaluated,
      created: discovery.created,
      queriesRun: discovery.queriesRun,
      scored: scoring.scored,
    },
  });

  return {
    workspaceId,
    skipped: false,
    searchQueriesGenerated,
    evaluated: discovery.evaluated,
    created: discovery.created,
    queriesRun: discovery.queriesRun,
    scored: scoring.scored,
  };
}

/**
 * Runs continuous discovery across every workspace with an ACTIVE or STALE
 * Business Brain (INITIALIZING ones aren't ready; there's no third state to
 * exclude). Each workspace is isolated — one workspace's failure doesn't
 * stop the rest — so this is safe to call unattended from a cron trigger.
 */
export async function runDiscoveryForAllWorkspaces(
  options: DiscoveryRunOptions = {},
): Promise<WorkspaceDiscoveryResult[]> {
  await dbConnect();
  const brains = await BusinessBrainModel.find({ status: { $in: ["ACTIVE", "STALE"] } }, { workspaceId: 1 });

  const results: WorkspaceDiscoveryResult[] = [];
  for (const { workspaceId } of brains) {
    try {
      results.push(await runDiscoveryForWorkspace(workspaceId, options));
    } catch (error) {
      results.push({
        workspaceId,
        skipped: true,
        reason: error instanceof Error ? error.message : "Unknown error.",
        searchQueriesGenerated: 0,
        evaluated: 0,
        created: 0,
        queriesRun: 0,
        scored: 0,
      });
    }
  }

  return results;
}
