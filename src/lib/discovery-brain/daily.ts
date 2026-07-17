import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { DiscoveryBrain as DiscoveryBrainModel } from "@/models";
import { executeDiscoveryRun, type ExecuteDiscoveryRunResult } from "./executor";

export type DailyDiscoveryWorkspaceResult =
  | ({ workspaceId: string; skipped: false } & ExecuteDiscoveryRunResult)
  | { workspaceId: string; skipped: true; reason: string };

/**
 * Runs one Search Execution Engine batch for every workspace that has a
 * Discovery Brain (i.e. has generated a queue at least once) — meant to be
 * called from a cron trigger (see src/app/api/cron/discovery-run/route.ts),
 * but safe to call directly too (e.g. from a script or test). Respects the
 * same DISCOVERY_BATCH_SIZE limit and per-item logging as a manual run.
 *
 * One workspace's failure doesn't stop the rest — each is isolated, mirroring
 * the existing `runDiscoveryForAllWorkspaces` continuous-discovery cron.
 */
export async function runDailyDiscovery(): Promise<DailyDiscoveryWorkspaceResult[]> {
  await dbConnect();
  const brains = await DiscoveryBrainModel.find({}, { workspaceId: 1 });

  const results: DailyDiscoveryWorkspaceResult[] = [];
  for (const { workspaceId } of brains) {
    try {
      const result = await executeDiscoveryRun(workspaceId, { runType: "DAILY" });
      results.push({ workspaceId, skipped: false, ...result });
    } catch (error) {
      results.push({
        workspaceId,
        skipped: true,
        reason: error instanceof Error ? error.message : "Unknown error running daily discovery.",
      });
    }
  }

  return results;
}
