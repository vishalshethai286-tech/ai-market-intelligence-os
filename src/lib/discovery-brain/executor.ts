import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  DiscoveryRun as DiscoveryRunModel,
  DiscoveryRunItem as DiscoveryRunItemModel,
  RawSearchResult as RawSearchResultModel,
  SearchProviderLog as SearchProviderLogModel,
  DiscoveryErrorLog as DiscoveryErrorLogModel,
  SearchQuery as SearchQueryModel,
  SearchQueueItem as SearchQueueItemModel,
  DiscoveryBrain as DiscoveryBrainModel,
} from "@/models";
import { search, resolveProviderName, SearchProviderNotConfiguredError, SearchProviderRequestError } from "@/lib/search";
import { refreshDimensionCoverage, computeCoverageSnapshot } from "./coverage";
import type { RunType, SearchType } from "@/models";

export class DiscoveryBrainNotReadyError extends Error {}

/** DISCOVERY_BATCH_SIZE env var, falling back to a sane default if unset/invalid. */
function defaultBatchSize(): number {
  const parsed = Number(process.env.DISCOVERY_BATCH_SIZE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function requestTimeoutMs(): number {
  const parsed = Number(process.env.DISCOVERY_SEARCH_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

/** Resolving the provider name can itself throw (e.g. misconfigured in production) — safe to call from an error-logging path, where a second throw would escape the per-item try/catch entirely. */
function safeProviderName(): string {
  try {
    return resolveProviderName();
  } catch {
    return process.env.SEARCH_PROVIDER?.toUpperCase() || "UNKNOWN";
  }
}

/** Categorizes a thrown error for DiscoveryErrorLog — a config problem is never worth retrying, everything else might be transient. */
function classifyError(error: unknown): { errorType: string; retryable: boolean } {
  if (error instanceof SearchProviderNotConfiguredError) return { errorType: "PROVIDER_NOT_CONFIGURED", retryable: false };
  if (error instanceof SearchProviderRequestError) {
    const timedOut = error.message.toLowerCase().includes("timed out");
    return { errorType: timedOut ? "TIMEOUT" : "PROVIDER_ERROR", retryable: true };
  }
  return { errorType: "UNKNOWN", retryable: true };
}

type QueueItemOutcome = { rawResultsFound: number; duplicatesFound: number; errored: boolean };

/**
 * Runs a single queued search end to end: executes it through the search
 * provider, stores every raw result, and marks the SearchQueueItem/
 * SearchQuery COVERED — or, on failure, logs the error and leaves the queue
 * item retryable (QUEUED) unless the error is a permanent configuration
 * problem (FAILED).
 */
async function runSingleQueueItem(
  workspaceId: string,
  discoveryRunId: string,
  queueItem: { id: string; searchQueryId: string; searchType: SearchType },
): Promise<QueueItemOutcome> {
  const searchQuery = await SearchQueryModel.findOne({ _id: queueItem.searchQueryId, workspaceId });
  if (!searchQuery) return { rawResultsFound: 0, duplicatesFound: 0, errored: false }; // orphaned queue item (query was deleted) — nothing to run

  await SearchQueueItemModel.updateOne({ _id: queueItem.id }, { status: "SEARCHING", startedAt: new Date() });

  const runItem = await DiscoveryRunItemModel.create({
    workspaceId,
    discoveryRunId,
    searchQueueItemId: queueItem.id,
    searchQueryId: searchQuery.id,
    searchType: queueItem.searchType,
    query: searchQuery.query,
    country: searchQuery.country,
    language: searchQuery.language,
    status: "RUNNING",
    startedAt: new Date(),
  });

  const requestStartedAt = new Date();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const results = await Promise.race([
      search(searchQuery.query, {
        country: searchQuery.country ?? undefined,
        language: searchQuery.language ?? undefined,
        searchType: queueItem.searchType,
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new SearchProviderRequestError("Search request timed out.")), requestTimeoutMs());
      }),
    ]);

    await SearchProviderLogModel.create({
      workspaceId,
      discoveryRunId,
      provider: resolveProviderName(),
      query: searchQuery.query,
      requestStartedAt,
      requestFinishedAt: new Date(),
      status: "SUCCESS",
      resultCount: results.length,
      estimatedCost: 0,
    });

    let duplicatesFound = 0;
    for (const result of results) {
      const isDuplicate = await RawSearchResultModel.findOne({ workspaceId, url: result.url }, { _id: 1 });
      if (isDuplicate) duplicatesFound += 1;

      await RawSearchResultModel.create({
        workspaceId,
        discoveryRunId,
        discoveryRunItemId: runItem.id,
        searchQueryId: searchQuery.id,
        searchQueueItemId: queueItem.id,
        searchType: queueItem.searchType,
        query: searchQuery.query,
        title: result.title,
        snippet: result.snippet || null,
        url: result.url,
        domain: result.domain || null,
        country: searchQuery.country,
        language: searchQuery.language,
        sourceProvider: result.provider,
        retrievedAt: result.retrievedAt,
        rawPayload: result.rawPayload ?? null,
      });
    }

    await DiscoveryRunItemModel.updateOne(
      { _id: runItem.id },
      { status: "COMPLETED", finishedAt: new Date(), rawResultsFound: results.length },
    );
    await SearchQueueItemModel.updateOne(
      { _id: queueItem.id },
      { status: "COVERED", finishedAt: new Date(), $inc: { attempts: 1 } },
    );
    await SearchQueryModel.updateOne({ _id: searchQuery.id }, { status: "COVERED", lastRunAt: new Date() });

    return { rawResultsFound: results.length, duplicatesFound, errored: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error running this search.";
    const { errorType, retryable } = classifyError(error);

    await SearchProviderLogModel.create({
      workspaceId,
      discoveryRunId,
      provider: safeProviderName(),
      query: searchQuery.query,
      requestStartedAt,
      requestFinishedAt: new Date(),
      status: errorType === "TIMEOUT" ? "TIMEOUT" : "FAILED",
      resultCount: 0,
      estimatedCost: 0,
      errorMessage: message,
    });

    await DiscoveryErrorLogModel.create({
      workspaceId,
      discoveryRunId,
      discoveryRunItemId: runItem.id,
      searchQueueItemId: queueItem.id,
      searchQueryId: searchQuery.id,
      errorType,
      errorMessage: message,
      stackTrace: error instanceof Error ? (error.stack ?? null) : null,
      retryable,
    });

    await DiscoveryRunItemModel.updateOne(
      { _id: runItem.id },
      { status: "FAILED", finishedAt: new Date(), errorMessage: message },
    );
    await SearchQueueItemModel.updateOne(
      { _id: queueItem.id },
      { status: retryable ? "QUEUED" : "FAILED", finishedAt: new Date(), errorMessage: message, $inc: { attempts: 1 } },
    );

    return { rawResultsFound: 0, duplicatesFound: 0, errored: true };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export type ExecuteDiscoveryRunOptions = {
  searchType?: SearchType;
  country?: string;
  maxQueueItems?: number;
  runType?: RunType;
};

export type ExecuteDiscoveryRunResult = {
  discoveryRunId: string;
  status: "COMPLETED" | "FAILED";
  queriesExecuted: number;
  rawResultsFound: number;
  duplicatesFound: number;
  errorsCount: number;
  estimatedApiCost: number;
};

/**
 * Executes one batch of queued SearchQueueItems through the configured
 * search provider and stores the raw results — the Search Execution Engine.
 * Never extracts results into customers/projects/tenders/vendor
 * registrations (that's a future phase) and never touches the Phase 5
 * planning logic (SearchQuery/SearchQueueItem creation) — it only consumes
 * what's already queued.
 *
 * Selection order: priority (desc) → fewest attempts first (so a
 * persistently-failing item doesn't crowd out never-tried ones) →
 * scheduledFor (soonest/unscheduled first) → createdAt (oldest first, FIFO
 * tie-break). Limited to `maxQueueItems` (if lower than
 * DISCOVERY_BATCH_SIZE) or DISCOVERY_BATCH_SIZE otherwise.
 */
export async function executeDiscoveryRun(
  workspaceId: string,
  options: ExecuteDiscoveryRunOptions = {},
): Promise<ExecuteDiscoveryRunResult> {
  await dbConnect();

  const discoveryBrain = await DiscoveryBrainModel.findOne({ workspaceId });
  if (!discoveryBrain) {
    throw new DiscoveryBrainNotReadyError("Generate the discovery queue before running discovery.");
  }

  const limit = Math.min(defaultBatchSize(), options.maxQueueItems ?? Infinity);

  const queueFilter: Record<string, unknown> = { workspaceId, status: "QUEUED" };
  if (options.searchType) queueFilter.searchType = options.searchType;
  if (options.country) {
    const matchingQueries = await SearchQueryModel.find({ workspaceId, country: options.country }, { _id: 1 });
    queueFilter.searchQueryId = { $in: matchingQueries.map((q) => q.id as string) };
  }

  const queueItems = await SearchQueueItemModel.find(queueFilter)
    .sort({ priority: -1, attempts: 1, scheduledFor: 1, createdAt: 1 })
    .limit(limit);

  const run = await DiscoveryRunModel.create({
    workspaceId,
    discoveryBrainId: discoveryBrain.id,
    runType: options.runType ?? "MANUAL",
    status: "RUNNING",
    searchType: options.searchType ?? null,
    startedAt: new Date(),
  });

  let queriesExecuted = 0;
  let rawResultsFound = 0;
  let duplicatesFound = 0;
  let errorsCount = 0;
  const estimatedApiCost = 0;

  try {
    for (const queueItem of queueItems) {
      const outcome = await runSingleQueueItem(workspaceId, run.id, {
        id: queueItem.id,
        searchQueryId: queueItem.searchQueryId,
        searchType: queueItem.searchType,
      });
      rawResultsFound += outcome.rawResultsFound;
      duplicatesFound += outcome.duplicatesFound;
      if (outcome.errored) errorsCount += 1;
      else queriesExecuted += 1;
    }
  } catch (error) {
    // A catastrophic failure (e.g. the DB connection drops mid-loop) — mark
    // the run FAILED rather than leaving it stuck RUNNING forever. Per-item
    // failures are already caught inside runSingleQueueItem and don't reach here.
    const message = error instanceof Error ? error.message : "Unknown error running this discovery run.";
    await DiscoveryErrorLogModel.create({
      workspaceId,
      discoveryRunId: run.id,
      errorType: "RUN_CRASHED",
      errorMessage: message,
      stackTrace: error instanceof Error ? (error.stack ?? null) : null,
      retryable: true,
    });
    errorsCount += 1;
    await DiscoveryRunModel.updateOne(
      { _id: run.id },
      { status: "FAILED", finishedAt: new Date(), queriesExecuted, rawResultsFound, duplicatesFound, errorsCount },
    );
    return { discoveryRunId: run.id, status: "FAILED", queriesExecuted, rawResultsFound, duplicatesFound, errorsCount, estimatedApiCost };
  }

  await DiscoveryRunModel.updateOne(
    { _id: run.id },
    {
      status: "COMPLETED",
      finishedAt: new Date(),
      queriesExecuted,
      rawResultsFound,
      duplicatesFound,
      errorsCount,
      estimatedApiCost,
    },
  );

  await refreshDimensionCoverage(workspaceId);
  await computeCoverageSnapshot(workspaceId);

  return { discoveryRunId: run.id, status: "COMPLETED", queriesExecuted, rawResultsFound, duplicatesFound, errorsCount, estimatedApiCost };
}
