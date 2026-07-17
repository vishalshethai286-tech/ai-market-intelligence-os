import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditProductCatalog } from "@/lib/access-control";
import { listProductServices } from "@/lib/product-discovery/service";
import { getLatestAnalysis } from "@/lib/website-analysis";
import type { ProductService } from "@/models";
import { RegenerateButton } from "@/components/product-discovery/regenerate-button";
import { AddProductServiceDialog } from "@/components/product-discovery/add-product-service-dialog";
import { ProductServiceRowActions } from "@/components/product-discovery/product-service-row-actions";
import { ExportLinks } from "@/components/ui/export-links";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Products & Services",
};

const STATUS_BADGE = {
  APPROVED: "success" as const,
  PENDING_REVIEW: "warning" as const,
  REJECTED: "danger" as const,
};

const PAGE_SIZE = 10;

type SortKey = "newest" | "name" | "confidence" | "last_verified";

function sortRecords(records: ProductService[], sort: SortKey): ProductService[] {
  const sorted = [...records];
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "confidence":
      return sorted.sort((a, b) => b.confidenceScore - a.confidenceScore);
    case "last_verified":
      return sorted.sort((a, b) => (b.lastVerifiedAt?.getTime() ?? 0) - (a.lastVerifiedAt?.getTime() ?? 0));
    case "newest":
    default:
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; sort?: string; page?: string }>;
}) {
  const active = await requireActiveWorkspace();
  const canEdit = canEditProductCatalog(active.role);
  const params = await searchParams;

  const [allRecords, latestAnalysis] = await Promise.all([
    listProductServices(active.workspace.id),
    getLatestAnalysis(active.workspace.id),
  ]);

  const hasCompletedAnalysis = latestAnalysis?.status === "COMPLETED";

  const q = (params.q ?? "").trim().toLowerCase();
  const statusFilter = params.status ?? "ALL";
  const typeFilter = params.type ?? "ALL";
  const sort: SortKey = (params.sort as SortKey) ?? "newest";
  const page = Math.max(1, Number(params.page) || 1);

  let filtered = allRecords;
  if (statusFilter !== "ALL") filtered = filtered.filter((r) => r.status === statusFilter);
  if (typeFilter !== "ALL") filtered = filtered.filter((r) => r.type === typeFilter);
  if (q) {
    filtered = filtered.filter((r) =>
      [r.name, r.category, r.subcategory, ...r.keywords].some((field) => field?.toLowerCase().includes(q)),
    );
  }
  const records = sortRecords(filtered, sort);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRecords = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function pageHref(overrides: Record<string, string>) {
    const next = new URLSearchParams({ q, status: statusFilter, type: typeFilter, sort, ...overrides });
    for (const [key, value] of [...next.entries()]) {
      if (!value || value === "ALL") next.delete(key);
    }
    const qs = next.toString();
    return qs ? `/dashboard/products?${qs}` : "/dashboard/products";
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Products & Services"
        description="AI-discovered from your website content. Review and edit before approving."
        action={
          <div className="flex items-center gap-2">
            {allRecords.length > 0 && <ExportLinks href="/api/export/products" />}
            {canEdit && (
              <>
                <AddProductServiceDialog />
                {allRecords.length > 0 && <RegenerateButton label="Re-run discovery" />}
              </>
            )}
          </div>
        }
      />

      {allRecords.length === 0 ? (
        <EmptyState
          title={hasCompletedAnalysis ? "No products or services discovered yet" : "No website analysis yet"}
          description={
            hasCompletedAnalysis
              ? canEdit
                ? undefined
                : "Ask an owner, admin, manager, or user to run discovery."
              : "Run a website analysis first — product/service discovery is built from that content. You can start one from onboarding, or by re-entering your company website."
          }
          action={hasCompletedAnalysis && canEdit ? <RegenerateButton label="Run discovery" /> : undefined}
        />
      ) : (
        <>
          <form className="mt-6 flex flex-wrap items-end gap-3" action="/dashboard/products">
            <div className="min-w-[200px] flex-1">
              <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search name, category, keywords..." />
            </div>
            <Select name="status" defaultValue={statusFilter} className="w-auto">
              <option value="ALL">All statuses</option>
              <option value="PENDING_REVIEW">Needs review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
            <Select name="type" defaultValue={typeFilter} className="w-auto">
              <option value="ALL">Product & service</option>
              <option value="PRODUCT">Product</option>
              <option value="SERVICE">Service</option>
            </Select>
            <Select name="sort" defaultValue={sort} className="w-auto">
              <option value="newest">Newest first</option>
              <option value="name">Name A-Z</option>
              <option value="confidence">Confidence, high to low</option>
              <option value="last_verified">Last verified</option>
            </Select>
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>

          {records.length === 0 ? (
            <EmptyState title="No records match your search/filters" className="mt-6" />
          ) : (
            <div className="mt-6 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Last verified</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/products/${record.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {record.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">
                        {record.type === "PRODUCT" ? "Product" : "Service"}
                      </TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{record.category ?? "—"}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">
                        {Math.round(record.confidenceScore * 100)}%
                      </TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">
                        {record.lastVerifiedAt ? record.lastVerifiedAt.toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[record.status]}>
                          {record.status === "PENDING_REVIEW" ? "Needs review" : record.status}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <ProductServiceRowActions id={record.id} status={record.status} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-black/50 dark:text-white/50">
                Page {currentPage} of {totalPages} &middot; {records.length} record{records.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={pageHref({ page: String(currentPage - 1) })}
                  aria-disabled={currentPage <= 1}
                  className={currentPage <= 1 ? "pointer-events-none opacity-40" : ""}
                >
                  <Button type="button" variant="outline" size="sm">
                    Previous
                  </Button>
                </Link>
                <Link
                  href={pageHref({ page: String(currentPage + 1) })}
                  aria-disabled={currentPage >= totalPages}
                  className={currentPage >= totalPages ? "pointer-events-none opacity-40" : ""}
                >
                  <Button type="button" variant="outline" size="sm">
                    Next
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
