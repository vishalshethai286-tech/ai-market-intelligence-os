import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { UsageLog, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform Admin — Export Logs" };

/**
 * "Export logs" are just export_generated UsageLog rows (see
 * src/lib/export/guard.ts) — there's no separate ExportLog model, since
 * exports are already a metered usage metric with a workspace/timestamp.
 */
export default async function PlatformAdminExportLogsPage() {
  await dbConnect();
  const logs = await UsageLog.find({ metric: "export_generated" }).sort({ occurredAt: -1 }).limit(200);
  const workspaceIds = [...new Set(logs.map((l) => l.workspaceId))];
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Export Logs" description={`${logs.length} most recent CSV exports across all workspaces, read-only.`} />

      {logs.length === 0 ? (
        <EmptyState title="No exports logged yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Occurred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{workspaceById.get(log.workspaceId)?.name ?? log.workspaceId}</TableCell>
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
