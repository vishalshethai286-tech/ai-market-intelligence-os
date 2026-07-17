import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { listDiscoveryRuns } from "@/lib/discovery-brain/runs";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Discovery Runs" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  QUEUED: "outline",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "outline",
};

export default async function DiscoveryRunsPage() {
  const active = await requireActiveWorkspace();
  const runs = await listDiscoveryRuns(active.workspace.id, 100);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Discovery Runs" description="Every Search Execution Engine run for this workspace, newest first." />

      {runs.length === 0 ? (
        <EmptyState
          title="No discovery runs yet"
          description="Run discovery from the Discovery Brain page to see runs here."
        />
      ) : (
        <div className="rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Search type</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>Raw results</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Link href={`/dashboard/discovery-runs/${run.id}`} className="font-medium underline-offset-2 hover:underline">
                      {run.runType}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[run.status] ?? "outline"}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{run.searchType ?? "All"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{run.queriesExecuted}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{run.rawResultsFound}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{run.errorsCount}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">${run.estimatedApiCost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
