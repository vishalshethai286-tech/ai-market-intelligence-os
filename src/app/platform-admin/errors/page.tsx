import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { DiscoveryErrorLog, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — Search Errors" };

export default async function PlatformAdminSearchErrorsPage() {
  await dbConnect();
  const errors = await DiscoveryErrorLog.find({}).sort({ createdAt: -1 }).limit(200);
  const workspaceIds = [...new Set(errors.map((e) => e.workspaceId))];
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Search Errors" description={`${errors.length} most recent discovery errors across all workspaces, read-only.`} />

      {errors.length === 0 ? (
        <EmptyState title="No search errors logged" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Retryable</TableHead>
                <TableHead>Occurred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((error) => (
                <TableRow key={error.id}>
                  <TableCell className="font-medium">{workspaceById.get(error.workspaceId)?.name ?? error.workspaceId}</TableCell>
                  <TableCell><Badge variant="danger">{error.errorType}</Badge></TableCell>
                  <TableCell className="max-w-md truncate text-black/60 dark:text-white/60" title={error.errorMessage}>
                    {error.errorMessage}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{error.retryable ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{error.createdAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
