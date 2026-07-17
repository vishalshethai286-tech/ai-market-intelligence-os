import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { ApiCostLog, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform Admin — API Cost Logs" };

function microsToUsd(costMicros: bigint | number): string {
  return `$${(Number(costMicros) / 1_000_000).toFixed(4)}`;
}

export default async function PlatformAdminApiCostsPage() {
  await dbConnect();
  const logs = await ApiCostLog.find({}).sort({ occurredAt: -1 }).limit(200);
  const workspaceIds = [...new Set(logs.map((l) => l.workspaceId))];
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  const totalMicros = logs.reduce((sum, l) => sum + Number(l.costMicros ?? 0), 0);
  const totalTokens = logs.reduce((sum, l) => sum + (l.totalTokens ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="API Cost Logs" description={`${logs.length} most recent AI/API cost entries across all workspaces, read-only.`} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total cost (shown page)" value={microsToUsd(totalMicros)} />
        <StatCard label="Total tokens (shown page)" value={totalTokens.toLocaleString()} />
      </div>

      {logs.length === 0 ? (
        <EmptyState title="No API cost logs yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Occurred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{workspaceById.get(log.workspaceId)?.name ?? log.workspaceId}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{log.provider}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{log.model}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{log.operation ?? "—"}</TableCell>
                  <TableCell>{log.totalTokens.toLocaleString()}</TableCell>
                  <TableCell>{microsToUsd(log.costMicros)}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{log.occurredAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
