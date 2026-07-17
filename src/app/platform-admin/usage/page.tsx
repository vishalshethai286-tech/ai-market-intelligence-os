import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { UsageLog, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform Admin — Usage" };

export default async function PlatformAdminUsagePage() {
  await dbConnect();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const byWorkspace = await UsageLog.aggregate([
    { $match: { occurredAt: { $gte: monthStart } } },
    { $group: { _id: { workspaceId: "$workspaceId", metric: "$metric" }, total: { $sum: { $toDouble: "$quantity" } } } },
    { $group: { _id: "$_id.workspaceId", metrics: { $push: { metric: "$_id.metric", total: "$total" } }, totalAll: { $sum: "$total" } } },
    { $sort: { totalAll: -1 } },
    { $limit: 100 },
  ]);

  const workspaceIds = byWorkspace.map((r) => r._id as string);
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Usage"
        description={`Metered usage since ${monthStart.toLocaleDateString()}, by workspace, read-only.`}
      />

      {byWorkspace.length === 0 ? (
        <EmptyState title="No metered usage this period" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Total events</TableHead>
                <TableHead>Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byWorkspace.map((row) => {
                const workspaceId = row._id as string;
                const metrics = row.metrics as { metric: string; total: number }[];
                return (
                  <TableRow key={workspaceId}>
                    <TableCell className="font-medium">{workspaceById.get(workspaceId)?.name ?? workspaceId}</TableCell>
                    <TableCell>{Math.round(row.totalAll as number).toLocaleString()}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {metrics
                        .sort((a, b) => b.total - a.total)
                        .map((m) => `${m.metric}: ${Math.round(m.total)}`)
                        .join(", ")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
