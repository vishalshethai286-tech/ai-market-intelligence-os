import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { DiscoveryRun, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — Discovery Runs" };

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  QUEUED: "default",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
};

export default async function PlatformAdminDiscoveryRunsPage() {
  await dbConnect();
  const runs = await DiscoveryRun.find({}).sort({ createdAt: -1 }).limit(200);
  const workspaceIds = [...new Set(runs.map((r) => r.workspaceId))];
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Discovery Runs" description={`${runs.length} most recent runs across all workspaces, read-only.`} />

      {runs.length === 0 ? (
        <EmptyState title="No discovery runs yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>Raw results</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Est. cost</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{workspaceById.get(run.workspaceId)?.name ?? run.workspaceId}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[run.status] ?? "default"}>{run.status.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{run.searchType ?? "all"}</TableCell>
                  <TableCell>{run.queriesExecuted}</TableCell>
                  <TableCell>{run.rawResultsFound}</TableCell>
                  <TableCell className={run.errorsCount > 0 ? "text-red-600 dark:text-red-400" : undefined}>{run.errorsCount}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">${run.estimatedApiCost.toFixed(2)}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
