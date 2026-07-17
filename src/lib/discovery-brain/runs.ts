import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  DiscoveryRun as DiscoveryRunModel,
  DiscoveryRunItem as DiscoveryRunItemModel,
  SearchProviderLog as SearchProviderLogModel,
  DiscoveryErrorLog as DiscoveryErrorLogModel,
  RawSearchResult as RawSearchResultModel,
} from "@/models";

export class DiscoveryRunNotFoundError extends Error {}

/** Recent discovery runs for a workspace, newest first, for the Discovery Runs list page. */
export async function listDiscoveryRuns(workspaceId: string, limit = 50) {
  await dbConnect();
  const runs = await DiscoveryRunModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit);
  return runs.map((r) => r.toObject());
}

/** Ownership-checked single-run read for the run detail page. */
export async function getDiscoveryRun(workspaceId: string, discoveryRunId: string) {
  await dbConnect();
  const run = await DiscoveryRunModel.findOne({ _id: discoveryRunId, workspaceId });
  if (!run) {
    throw new DiscoveryRunNotFoundError("That discovery run doesn't exist in this workspace.");
  }
  return run.toObject();
}

export async function listDiscoveryRunItems(workspaceId: string, discoveryRunId: string) {
  await dbConnect();
  const items = await DiscoveryRunItemModel.find({ workspaceId, discoveryRunId }).sort({ createdAt: 1 });
  return items.map((item) => item.toObject());
}

export async function listErrorLogsForRun(workspaceId: string, discoveryRunId: string) {
  await dbConnect();
  const logs = await DiscoveryErrorLogModel.find({ workspaceId, discoveryRunId }).sort({ createdAt: 1 });
  return logs.map((log) => log.toObject());
}

export async function listProviderLogsForRun(workspaceId: string, discoveryRunId: string) {
  await dbConnect();
  const logs = await SearchProviderLogModel.find({ workspaceId, discoveryRunId }).sort({ createdAt: 1 });
  return logs.map((log) => log.toObject());
}

export type DiscoveryDashboardStats = {
  totalRawResults: number;
  unprocessedRawResults: number;
  totalRuns: number;
  failedRuns: number;
  errorsNeedingAttention: number;
  monthlyEstimatedApiCost: number;
};

/** Aggregated counts for the dashboard's Discovery summary section — raw result backlog, run health, and a real (not fabricated) monthly cost rollup from each run's own estimatedApiCost field. */
export async function getDiscoveryDashboardStats(workspaceId: string): Promise<DiscoveryDashboardStats> {
  await dbConnect();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalRawResults, unprocessedRawResults, totalRuns, failedRuns, errorsNeedingAttention, monthlyRuns] = await Promise.all([
    RawSearchResultModel.countDocuments({ workspaceId }),
    RawSearchResultModel.countDocuments({ workspaceId, processedStatus: "UNPROCESSED" }),
    DiscoveryRunModel.countDocuments({ workspaceId }),
    DiscoveryRunModel.countDocuments({ workspaceId, status: "FAILED" }),
    DiscoveryErrorLogModel.countDocuments({ workspaceId, retryable: false }),
    DiscoveryRunModel.find({ workspaceId, createdAt: { $gte: startOfMonth } }, { estimatedApiCost: 1 }),
  ]);

  const monthlyEstimatedApiCost = monthlyRuns.reduce((sum, run) => sum + (run.estimatedApiCost as number), 0);

  return { totalRawResults, unprocessedRawResults, totalRuns, failedRuns, errorsNeedingAttention, monthlyEstimatedApiCost };
}
