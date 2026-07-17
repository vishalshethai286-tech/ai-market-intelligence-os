import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listRawSearchResults } from "@/lib/discovery-brain/raw-results";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ProcessCustomerResultsButton } from "@/components/customers/process-customer-results-button";
import { ProcessProjectResultsButton } from "@/components/projects/process-project-results-button";
import { ProcessTenderResultsButton } from "@/components/tenders/process-tender-results-button";
import { ProcessVendorRegistrationResultsButton } from "@/components/vendor-registrations/process-vendor-registration-results-button";
import { ProcessContactResultsButton } from "@/components/contact-discovery/process-contact-results-button";

export const metadata: Metadata = { title: "Raw Search Results" };

export default async function RawSearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    searchType?: string;
    country?: string;
    sourceProvider?: string;
    processedStatus?: string;
    extractionStatus?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const { results, total, page, totalPages } = await listRawSearchResults(active.workspace.id, {
    q: params.q,
    searchType: params.searchType,
    country: params.country,
    sourceProvider: params.sourceProvider,
    processedStatus: params.processedStatus,
    extractionStatus: params.extractionStatus,
    page: Number(params.page) || 1,
  });

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.q ? { q: params.q } : {}),
      ...(params.searchType ? { searchType: params.searchType } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.sourceProvider ? { sourceProvider: params.sourceProvider } : {}),
      ...(params.processedStatus ? { processedStatus: params.processedStatus } : {}),
      ...(params.extractionStatus ? { extractionStatus: params.extractionStatus } : {}),
      page: String(nextPage),
    });
    return `/dashboard/raw-search-results?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Raw Search Results"
        description={`${total} raw result${total === 1 ? "" : "s"} found by the Search Execution Engine — unprocessed, before any extraction.`}
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <ProcessCustomerResultsButton />
              <ProcessProjectResultsButton />
              <ProcessTenderResultsButton />
              <ProcessVendorRegistrationResultsButton />
              <ProcessContactResultsButton />
            </div>
          ) : undefined
        }
      />

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/dashboard/raw-search-results">
        <div className="min-w-[220px] flex-1">
          <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search title, snippet, query, domain..." />
        </div>
        <Select name="searchType" defaultValue={params.searchType ?? ""} className="w-auto">
          <option value="">All search types</option>
          <option value="CUSTOMER">Customer</option>
          <option value="PROJECT">Project</option>
          <option value="TENDER">Tender</option>
          <option value="VENDOR_REGISTRATION">Vendor registration</option>
          <option value="CONTACT">Contact</option>
        </Select>
        <Input name="country" defaultValue={params.country ?? ""} placeholder="Country (ISO)" className="w-28" maxLength={2} />
        <Input name="sourceProvider" defaultValue={params.sourceProvider ?? ""} placeholder="Provider" className="w-32" />
        <Select name="processedStatus" defaultValue={params.processedStatus ?? ""} className="w-auto">
          <option value="">All processed statuses</option>
          <option value="UNPROCESSED">Unprocessed</option>
          <option value="PROCESSING">Processing</option>
          <option value="PROCESSED">Processed</option>
          <option value="FAILED">Failed</option>
          <option value="IGNORED">Ignored</option>
        </Select>
        <Select name="extractionStatus" defaultValue={params.extractionStatus ?? ""} className="w-auto">
          <option value="">All extraction statuses</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="PENDING">Pending</option>
          <option value="EXTRACTED">Extracted</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {results.length === 0 ? (
        <EmptyState title="No raw results match your search/filters" className="mt-6" />
      ) : (
        <div className="mt-6 rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Search type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Retrieved</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Extraction</TableHead>
                <TableHead>Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-xs">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                      {r.title}
                    </a>
                    {r.snippet && <p className="mt-1 truncate text-xs text-black/50 dark:text-white/50">{r.snippet}</p>}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{r.domain ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{r.searchType}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{r.country ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{r.sourceProvider}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{new Date(r.retrievedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.processedStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.extractionStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/discovery-runs/${r.discoveryRunId}`}
                      className="text-xs underline underline-offset-2"
                    >
                      View run
                    </Link>
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
