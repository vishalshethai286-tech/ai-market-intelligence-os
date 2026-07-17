import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listTenderBuyers } from "@/lib/tenders/buyer-service";
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

export const metadata: Metadata = { title: "Tender Buyers" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  NEW: "outline",
  REVIEWED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  WATCHING: "warning",
  CONTACTED: "warning",
  ARCHIVED: "outline",
};

export default async function TenderBuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; status?: string; duplicateStatus?: string; page?: string }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const [{ buyers, total, page, totalPages }, duplicateStats] = await Promise.all([
    listTenderBuyers(active.workspace.id, {
      q: params.q,
      country: params.country,
      status: params.status,
      duplicateStatus: params.duplicateStatus,
      page: Number(params.page) || 1,
    }),
    getDuplicateDashboardStats(active.workspace.id, "TENDER_BUYER"),
  ]);

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.q ? { q: params.q } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.duplicateStatus ? { duplicateStatus: params.duplicateStatus } : {}),
      page: String(nextPage),
    });
    return `/dashboard/tender-buyers?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Tender Buyers"
        description="Procurement bodies and buyers worldwide who publish tenders relevant to your products and services, found via continuous global discovery."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/tender-buyers" />
            {canManage && <ProcessTenderResultsButton />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total tender buyers" value={total} />
        <StatCard label="This page" value={buyers.length} hint={`Page ${page} of ${totalPages}`} />
        <StatCard
          label="Pending duplicates"
          value={duplicateStats.pendingReview}
          hint={duplicateStats.pendingReview > 0 ? "Review in Duplicates" : undefined}
        />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/tender-buyers">
        <div className="min-w-[220px] flex-1">
          <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search customer, website, or country..." />
        </div>
        <Input name="country" defaultValue={params.country ?? ""} placeholder="Country" className="w-32" />
        <Select name="status" defaultValue={params.status ?? ""} className="w-auto">
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="WATCHING">Watching</option>
          <option value="CONTACTED">Contacted</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select name="duplicateStatus" defaultValue={params.duplicateStatus ?? ""} className="w-auto">
          <option value="">All duplicate statuses</option>
          <option value="UNIQUE">Unique</option>
          <option value="POSSIBLE_DUPLICATE">Possible duplicate</option>
          <option value="DUPLICATE">Duplicate</option>
          <option value="MERGED">Merged</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {buyers.length === 0 ? (
        <EmptyState
          title="No tender buyers yet"
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
                <TableHead>Country</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Tender Website Link</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duplicate Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.map((buyer) => (
                <TableRow key={buyer.id}>
                  <TableCell>
                    <Link href={`/dashboard/tender-buyers/${buyer.id}`} className="font-medium underline-offset-2 hover:underline">
                      {buyer.customerName}
                    </Link>
                    {buyer.lastVerifiedAt && (
                      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                        Verified {new Date(buyer.lastVerifiedAt).toLocaleDateString()}
                      </p>
                    )}
                    {buyer.sourceUrl && (
                      <a href={buyer.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-black/50 underline-offset-2 hover:underline dark:text-white/50">
                        Source
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{buyer.country ?? "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-black/60 dark:text-white/60">{buyer.address ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{buyer.phoneNumber ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {buyer.website ? (
                      <a href={buyer.website} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {buyer.websiteDomain ?? buyer.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {buyer.tenderWebsiteLink ? (
                      <a href={buyer.tenderWebsiteLink} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[buyer.status] ?? "outline"}>{buyer.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {buyer.duplicateStatus !== "UNIQUE" ? (
                      <Badge variant="outline">{buyer.duplicateStatus.replace(/_/g, " ").toLowerCase()}</Badge>
                    ) : (
                      "—"
                    )}
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
