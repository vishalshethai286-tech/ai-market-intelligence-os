import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listTenderOpportunities } from "@/lib/tenders/opportunity-service";
import { getDuplicateDashboardStats } from "@/lib/dedup/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExportCsvLink } from "@/components/ui/export-csv-link";
import { ProcessTenderResultsButton } from "@/components/tenders/process-tender-results-button";

export const metadata: Metadata = { title: "Live Tenders" };

const PRIORITY_BADGE: Record<string, "success" | "warning" | "default" | "danger"> = {
  A_PLUS: "success",
  A: "success",
  B: "warning",
  C: "danger",
};
const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  NEW: "outline",
  REVIEWED: "warning",
  ELIGIBLE: "success",
  NOT_ELIGIBLE: "danger",
  SUBMITTED: "warning",
  WON: "success",
  LOST: "danger",
  EXPIRED: "outline",
  ARCHIVED: "outline",
};

export default async function LiveTendersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    priority?: string;
    status?: string;
    activeState?: string;
    sortBy?: string;
    sortDir?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const [{ opportunities, total, page, totalPages }, duplicateStats] = await Promise.all([
    listTenderOpportunities(active.workspace.id, {
      q: params.q,
      country: params.country,
      priority: params.priority,
      status: params.status,
      activeState: params.activeState === "ACTIVE" || params.activeState === "EXPIRED" ? params.activeState : undefined,
      sortBy: params.sortBy === "priorityScore" || params.sortBy === "endDate" ? params.sortBy : "createdAt",
      sortDir: params.sortDir === "desc" ? "desc" : "asc",
      page: Number(params.page) || 1,
    }),
    getDuplicateDashboardStats(active.workspace.id, "TENDER_OPPORTUNITY"),
  ]);

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.q ? { q: params.q } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.activeState ? { activeState: params.activeState } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortDir ? { sortDir: params.sortDir } : {}),
      page: String(nextPage),
    });
    return `/dashboard/live-tenders?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Live Tenders"
        description="Open public tenders and RFPs matching your products/services and target countries, found via continuous global discovery."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/live-tenders" />
            {canManage && <ProcessTenderResultsButton />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total live tenders" value={total} />
        <StatCard label="This page" value={opportunities.length} hint={`Page ${page} of ${totalPages}`} />
        <StatCard label="A+ on this page" value={opportunities.filter((o) => o.priority === "A_PLUS").length} />
        <StatCard
          label="Pending duplicates"
          value={duplicateStats.pendingReview}
          hint={duplicateStats.pendingReview > 0 ? "Review in Duplicates" : undefined}
        />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/live-tenders">
        <div className="min-w-[220px] flex-1">
          <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search customer, buyer, title, or product..." />
        </div>
        <Input name="country" defaultValue={params.country ?? ""} placeholder="Country" className="w-32" />
        <Select name="priority" defaultValue={params.priority ?? ""} className="w-auto">
          <option value="">All priorities</option>
          <option value="A_PLUS">A+</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </Select>
        <Select name="status" defaultValue={params.status ?? ""} className="w-auto">
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="ELIGIBLE">Eligible</option>
          <option value="NOT_ELIGIBLE">Not eligible</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
          <option value="EXPIRED">Expired</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select name="activeState" defaultValue={params.activeState ?? ""} className="w-auto">
          <option value="">Active + expired</option>
          <option value="ACTIVE">Active only</option>
          <option value="EXPIRED">Expired only</option>
        </Select>
        <Select name="sortBy" defaultValue={params.sortBy ?? "createdAt"} className="w-auto">
          <option value="createdAt">Sort: newest</option>
          <option value="endDate">Sort: end date</option>
          <option value="priorityScore">Sort: priority score</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {opportunities.length === 0 ? (
        <EmptyState
          title="No live tenders yet"
          className="mt-6"
          description={
            canManage
              ? "Run discovery, then process the tender raw results to populate this list."
              : "Ask an owner, admin, manager, or user to run and process discovery."
          }
        />
      ) : (
        <div className="mt-6 rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead>Tender Title</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Tender Link</TableHead>
                <TableHead>Buyer Org</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell>
                    <Link href={`/dashboard/live-tenders/${opportunity.id}`} className="font-medium underline-offset-2 hover:underline">
                      {opportunity.customerName || opportunity.buyerOrganization}
                    </Link>
                    {opportunity.duplicateStatus !== "UNIQUE" && (
                      <Badge variant="outline" className="mt-1 block w-fit">
                        {opportunity.duplicateStatus.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{opportunity.tenderTitle}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {opportunity.startDate ? new Date(opportunity.startDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {opportunity.endDate ? new Date(opportunity.endDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {opportunity.tenderLink ? (
                      <a href={opportunity.tenderLink} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-black/60 dark:text-white/60">{opportunity.buyerOrganization}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{opportunity.country ?? "—"}</TableCell>
                  <TableCell>
                    {opportunity.priority ? (
                      <Badge variant={PRIORITY_BADGE[opportunity.priority] ?? "default"}>{PRIORITY_LABEL[opportunity.priority]}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[opportunity.status] ?? "outline"}>{opportunity.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-black/50 dark:text-white/50">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Link href={pageHref(page - 1)} className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
              <Button type="button" variant="outline" size="sm">
                Previous
              </Button>
            </Link>
            <Link href={pageHref(page + 1)} className={page >= totalPages ? "pointer-events-none opacity-40" : ""}>
              <Button type="button" variant="outline" size="sm">
                Next
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
