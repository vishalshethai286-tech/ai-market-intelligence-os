import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  Workspace,
  BusinessBrain,
  DiscoveryBrain,
  SearchSource,
  SearchQuery,
  SearchQueueItem,
  CountryCoverage,
  IndustryCoverage,
  ProductCoverage,
  SourceCoverage,
  CoverageSnapshot,
  DiscoveryStrategy,
  DiscoveryRun,
  DiscoveryRunItem,
  SearchProviderLog,
  DiscoveryErrorLog,
  RawSearchResult,
  TargetCustomer,
  ProjectOpportunity,
  DuplicateRecord,
  MergeHistory,
  SourceHistory,
} from "@/models";

export class TestDbCleanupNotAllowedError extends Error {}

/**
 * True only when it's safe to run destructive orphaned-record cleanup:
 * Vitest sets NODE_ENV=test automatically for every test run, so this passes
 * with zero configuration inside `npm test`. ALLOW_TEST_DB_CLEANUP=true is
 * the explicit opt-in for a one-off manual/script invocation outside a test
 * process (e.g. a maintenance run against the same shared test database).
 * This must never be true against a real dev/staging/production database —
 * there is deliberately no "just trust me" override beyond these two checks.
 */
export function isTestDbCleanupAllowed(): boolean {
  return process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_DB_CLEANUP === "true";
}

/**
 * Every workspace-scoped model this cleanup also sweeps once it's found the
 * live workspace set — same "orphaned if workspaceId isn't a live workspace"
 * rule as BusinessBrain, just applied to every other model that piles up
 * test debris the same way (Mongoose has no cascade delete, so a test
 * deleting its Workspace row never cleans up everything that pointed at it).
 */
const RELATED_MODELS = {
  DiscoveryBrain,
  SearchSource,
  SearchQuery,
  SearchQueueItem,
  CountryCoverage,
  IndustryCoverage,
  ProductCoverage,
  SourceCoverage,
  CoverageSnapshot,
  DiscoveryStrategy,
  DiscoveryRun,
  DiscoveryRunItem,
  SearchProviderLog,
  DiscoveryErrorLog,
  RawSearchResult,
  TargetCustomer,
  ProjectOpportunity,
  DuplicateRecord,
  MergeHistory,
  SourceHistory,
} as const;

export type CleanupOrphanedTestRecordsSummary = {
  guardUsed: "NODE_ENV=test" | "ALLOW_TEST_DB_CLEANUP=true";
  businessBrainFound: number;
  businessBrainDeleted: number;
  businessBrainSkipped: number;
  relatedDeleted: Record<string, number>;
};

/**
 * Deletes BusinessBrain rows (and the same-shaped debris in every model in
 * RELATED_MODELS) whose workspaceId no longer matches any existing
 * Workspace. Only ever touches rows with no live workspace — a still-valid
 * workspace's records are never in scope, regardless of how many other
 * workspaces get cleaned up around them. Refuses to run at all unless
 * isTestDbCleanupAllowed() is true.
 */
export async function cleanupOrphanedTestRecords(): Promise<CleanupOrphanedTestRecordsSummary> {
  if (!isTestDbCleanupAllowed()) {
    throw new TestDbCleanupNotAllowedError(
      "Refusing to run orphaned-record cleanup: NODE_ENV is not 'test' and ALLOW_TEST_DB_CLEANUP is not 'true'. " +
        "This guard exists specifically so this never runs against a real dev/staging/production database.",
    );
  }

  await dbConnect();
  const guardUsed: CleanupOrphanedTestRecordsSummary["guardUsed"] =
    process.env.NODE_ENV === "test" ? "NODE_ENV=test" : "ALLOW_TEST_DB_CLEANUP=true";

  const liveWorkspaceIds = (await Workspace.find({}, { _id: 1 })).map((w) => w.id as string);
  const orphanFilter = { workspaceId: { $nin: liveWorkspaceIds } };

  const businessBrainFound = await BusinessBrain.countDocuments(orphanFilter);
  const businessBrainResult = await BusinessBrain.deleteMany(orphanFilter);
  const businessBrainDeleted = businessBrainResult.deletedCount ?? 0;
  const businessBrainSkipped = businessBrainFound - businessBrainDeleted;

  const relatedDeleted: Record<string, number> = {};
  for (const [name, Model] of Object.entries(RELATED_MODELS)) {
    const result = await Model.deleteMany(orphanFilter);
    relatedDeleted[name] = result.deletedCount ?? 0;
  }

  const summary: CleanupOrphanedTestRecordsSummary = {
    guardUsed,
    businessBrainFound,
    businessBrainDeleted,
    businessBrainSkipped,
    relatedDeleted,
  };

  console.log(
    `[cleanupOrphanedTestRecords] guard=${guardUsed} BusinessBrain: found=${businessBrainFound} deleted=${businessBrainDeleted} skipped=${businessBrainSkipped}`,
  );
  console.log("[cleanupOrphanedTestRecords] related records deleted:", relatedDeleted);

  return summary;
}
