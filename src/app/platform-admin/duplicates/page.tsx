import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { DuplicateRecord } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform Admin — Duplicate Statistics" };

export default async function PlatformAdminDuplicateStatisticsPage() {
  await dbConnect();
  const byTypeAndStatus = await DuplicateRecord.aggregate([
    { $group: { _id: { recordType: "$recordType", status: "$status" }, count: { $sum: 1 } } },
    { $sort: { "_id.recordType": 1, "_id.status": 1 } },
  ]);

  const total = byTypeAndStatus.reduce((sum, row) => sum + (row.count as number), 0);
  const autoMerged = byTypeAndStatus.filter((r) => r._id.status === "AUTO_MERGED").reduce((sum, r) => sum + (r.count as number), 0);
  const pendingReview = byTypeAndStatus.filter((r) => r._id.status === "PENDING_REVIEW").reduce((sum, r) => sum + (r.count as number), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Duplicate Statistics" description="Duplicate detection outcomes across all workspaces, read-only." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total duplicate records" value={total} />
        <StatCard label="Auto-merged" value={autoMerged} />
        <StatCard label="Pending review" value={pendingReview} />
      </div>

      {byTypeAndStatus.length === 0 ? (
        <EmptyState title="No duplicate records yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTypeAndStatus.map((row) => (
                <TableRow key={`${row._id.recordType}-${row._id.status}`}>
                  <TableCell className="font-medium">{row._id.recordType}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row._id.status}</TableCell>
                  <TableCell>{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
