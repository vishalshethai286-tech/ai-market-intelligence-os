import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listCustomers } from "@/lib/customers/service";
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
import { ProcessCustomerResultsButton } from "@/components/customers/process-customer-results-button";

export const metadata: Metadata = { title: "Customers" };

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
  APPROVED: "success",
  REJECTED: "danger",
  CONTACTED: "warning",
  CONVERTED: "success",
  ARCHIVED: "outline",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    priority?: string;
    status?: string;
    sortBy?: string;
    sortDir?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const [{ customers, total, page, totalPages }, duplicateStats] = await Promise.all([
    listCustomers(active.workspace.id, {
      q: params.q,
      country: params.country,
      priority: params.priority,
      status: params.status,
      sortBy: params.sortBy === "score" ? "score" : "createdAt",
      sortDir: params.sortDir === "asc" ? "asc" : "desc",
      page: Number(params.page) || 1,
    }),
    getDuplicateDashboardStats(active.workspace.id, "CUSTOMER"),
  ]);

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.q ? { q: params.q } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortDir ? { sortDir: params.sortDir } : {}),
      page: String(nextPage),
    });
    return `/dashboard/customers?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Customers"
        description="Target customers extracted from continuous global discovery of public online sources, matched and scored against your Business Brain."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/customers" />
            {canManage && <ProcessCustomerResultsButton />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total customers" value={total} />
        <StatCard label="This page" value={customers.length} hint={`Page ${page} of ${totalPages}`} />
        <StatCard label="A+ on this page" value={customers.filter((c) => c.priority === "A_PLUS").length} />
        <StatCard
          label="Pending duplicates"
          value={duplicateStats.pendingReview}
          hint={duplicateStats.pendingReview > 0 ? "Review in Duplicates" : undefined}
        />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/customers">
        <div className="min-w-[220px] flex-1">
          <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search name or website..." />
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
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CONVERTED">Converted</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select name="sortBy" defaultValue={params.sortBy ?? "createdAt"} className="w-auto">
          <option value="createdAt">Sort: newest</option>
          <option value="score">Sort: score</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title="No target customers yet"
          className="mt-6"
          description={
            canManage
              ? "Run discovery, then process the customer raw results to populate this list."
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
                <TableHead>Website</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link href={`/dashboard/customers/${customer.id}`} className="font-medium underline-offset-2 hover:underline">
                      {customer.customerName}
                    </Link>
                    {customer.duplicateStatus !== "UNIQUE" && (
                      <Badge variant="outline" className="mt-1 block w-fit">
                        {customer.duplicateStatus.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                    {customer.lastVerifiedAt && (
                      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                        Verified {new Date(customer.lastVerifiedAt).toLocaleDateString()}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{customer.country ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {customer.website ? (
                      <a href={customer.website} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {customer.websiteDomain ?? customer.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-black/60 dark:text-white/60">{customer.address ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{customer.phoneNumber ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{Math.round(customer.score)}</TableCell>
                  <TableCell>
                    {customer.priority ? (
                      <Badge variant={PRIORITY_BADGE[customer.priority] ?? "default"}>{PRIORITY_LABEL[customer.priority]}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[customer.status] ?? "outline"}>{customer.status}</Badge>
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
