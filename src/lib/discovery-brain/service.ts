import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  DiscoveryBrain as DiscoveryBrainModel,
  SearchQuery as SearchQueryModel,
  SearchQueueItem as SearchQueueItemModel,
  DiscoveryStrategy as DiscoveryStrategyModel,
} from "@/models";
import { getBusinessBrain, BrainNotReadyError } from "@/lib/business-brain/service";
import { planDiscoveryQueries } from "./generator";
import { ensureCountryCoverageSeeded, refreshDimensionCoverage, computeCoverageSnapshot } from "./coverage";
import type { DiscoveryBrain } from "@/models";

export { BrainNotReadyError };

export type GenerateDiscoveryQueueResult = {
  queriesPlanned: number;
  queriesCreated: number;
  queueItemsCreated: number;
};

/** Gets (never creates) the workspace's DiscoveryBrain — null if the queue has never been generated. */
export async function getDiscoveryBrain(workspaceId: string): Promise<DiscoveryBrain | null> {
  await dbConnect();
  const brain = await DiscoveryBrainModel.findOne({ workspaceId });
  return brain ? (brain.toObject() as DiscoveryBrain) : null;
}

/**
 * Generates (or regenerates) the discovery queue for a workspace: plans
 * candidate queries from the Business Brain (source of truth), persists new
 * ones as QUEUED SearchQuery + SearchQueueItem rows (existing query text is
 * never duplicated), records a DiscoveryStrategy summary, and refreshes
 * coverage tracking. Never executes a search or extracts results — this
 * only plans, queues, and tracks coverage.
 */
export async function generateDiscoveryQueue(workspaceId: string): Promise<GenerateDiscoveryQueueResult> {
  const businessBrain = await getBusinessBrain(workspaceId);
  if (!businessBrain || businessBrain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before generating a discovery queue.");
  }

  await dbConnect();
  await ensureCountryCoverageSeeded(workspaceId);

  let discoveryBrain = await DiscoveryBrainModel.findOne({ workspaceId });
  if (!discoveryBrain) {
    discoveryBrain = await DiscoveryBrainModel.create({
      workspaceId,
      businessBrainId: businessBrain.id,
      status: "NOT_STARTED",
    });
  }

  const planned = await planDiscoveryQueries(workspaceId);

  const existing = await SearchQueryModel.find({ workspaceId, query: { $in: planned.map((p) => p.query) } }, { query: 1 });
  const seen = new Set(existing.map((r) => r.query as string));

  const toInsert = planned.filter((p) => {
    if (seen.has(p.query)) return false;
    seen.add(p.query);
    return true;
  });

  let queriesCreated = 0;
  let queueItemsCreated = 0;

  if (toInsert.length > 0) {
    const inserted = await SearchQueryModel.insertMany(
      toInsert.map((p) => ({
        workspaceId,
        brainId: businessBrain.id,
        query: p.query,
        searchType: p.searchType,
        productServiceId: p.productServiceId,
        industry: p.industry,
        buyerType: p.buyerType,
        country: p.country,
        language: p.language,
        status: "QUEUED",
      })),
      { ordered: false },
    );
    queriesCreated = inserted.length;

    const queueItems = await SearchQueueItemModel.insertMany(
      inserted.map((q) => ({
        workspaceId,
        searchQueryId: q.id,
        searchType: q.searchType,
        status: "QUEUED",
      })),
      { ordered: false },
    );
    queueItemsCreated = queueItems.length;
  }

  const [totalSearchQueries, totalQueueItems] = await Promise.all([
    SearchQueryModel.countDocuments({ workspaceId }),
    SearchQueueItemModel.countDocuments({ workspaceId }),
  ]);

  await DiscoveryBrainModel.updateOne(
    { _id: discoveryBrain.id },
    {
      status: totalSearchQueries > 0 ? "QUEUED" : "NOT_STARTED",
      lastQueueGeneratedAt: new Date(),
      totalSearchQueries,
      totalQueueItems,
    },
  );

  await recordDiscoveryStrategy(workspaceId, businessBrain.id, planned);
  await refreshDimensionCoverage(workspaceId);
  await computeCoverageSnapshot(workspaceId);

  return { queriesPlanned: planned.length, queriesCreated, queueItemsCreated };
}

async function recordDiscoveryStrategy(
  workspaceId: string,
  businessBrainId: string,
  planned: Awaited<ReturnType<typeof planDiscoveryQueries>>,
): Promise<void> {
  const productIds = new Set(planned.map((p) => p.productServiceId).filter((v): v is string => Boolean(v)));
  const industries = new Set(planned.map((p) => p.industry).filter((v): v is string => Boolean(v)));
  const countries = new Set(planned.map((p) => p.country).filter((v): v is string => Boolean(v)));
  const buyerTypes = new Set(planned.map((p) => p.buyerType).filter((v): v is string => Boolean(v)));

  const summary =
    planned.length === 0
      ? "No candidate queries yet — approve products/services and set target countries to start planning."
      : `Targeting ${productIds.size} product/service${productIds.size === 1 ? "" : "s"} across ${countries.size} ` +
        `countr${countries.size === 1 ? "y" : "ies"} and ${industries.size} industr${industries.size === 1 ? "y" : "ies"}, ` +
        `covering customer, project, tender, and vendor-registration discovery.`;

  await DiscoveryStrategyModel.create({
    workspaceId,
    businessBrainId,
    summary,
    totalProducts: productIds.size,
    totalIndustries: industries.size,
    totalCountries: countries.size,
    totalBuyerTypes: buyerTypes.size,
    priorityCountries: [...countries],
    priorityIndustries: [...industries],
    status: planned.length > 0 ? "QUEUED" : "NOT_STARTED",
  });
}

/** Latest recorded strategy for the Discovery Brain page's "strategy summary" section — null if the queue has never been generated. */
export async function getLatestDiscoveryStrategy(workspaceId: string) {
  await dbConnect();
  const strategy = await DiscoveryStrategyModel.findOne({ workspaceId }).sort({ createdAt: -1 });
  return strategy ? strategy.toObject() : null;
}

export type SearchQueueFilters = { status?: string; searchType?: string };

/** Lists queue items for a workspace, newest first, optionally filtered. */
export async function listDiscoveryQueue(workspaceId: string, filters: SearchQueueFilters = {}) {
  await dbConnect();
  const items = await SearchQueueItemModel.find({ workspaceId, ...filters }).sort({ priority: -1, createdAt: -1 });
  return items.map((item) => item.toObject());
}

/** Search queries for a workspace, newest first, optionally filtered — for the Discovery Brain page's query list. */
export async function listDiscoveryQueries(workspaceId: string, filters: SearchQueueFilters = {}) {
  await dbConnect();
  const queries = await SearchQueryModel.find({ workspaceId, ...filters }).sort({ createdAt: -1 });
  return queries.map((q) => q.toObject());
}
