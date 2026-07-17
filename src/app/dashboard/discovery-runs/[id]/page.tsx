import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import {
  getDiscoveryRun,
  listDiscoveryRunItems,
  listErrorLogsForRun,
  listProviderLogsForRun,
  DiscoveryRunNotFoundError,
} from "@/lib/discovery-brain/runs";
import { countCustomersForRun } from "@/lib/customers/service";
import { countProjectsForRun } from "@/lib/projects/service";
import { countTenderBuyersForRun } from "@/lib/tenders/buyer-service";
import { countTenderOpportunitiesForRun } from "@/lib/tenders/opportunity-service";
import { countVendorRegistrationsForRun } from "@/lib/vendor-registrations/service";
import { getContactDiscoveryRunSummary } from "@/lib/contact-discovery/service";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProcessCustomerResultsButton } from "@/components/customers/process-customer-results-button";
import { ProcessProjectResultsButton } from "@/components/projects/process-project-results-button";
import { ProcessTenderResultsButton } from "@/components/tenders/process-tender-results-button";
import { ProcessVendorRegistrationResultsButton } from "@/components/vendor-registrations/process-vendor-registration-results-button";
import { ProcessContactResultsButton } from "@/components/contact-discovery/process-contact-results-button";

export const metadata: Metadata = { title: "Discovery Run detail" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  QUEUED: "outline",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "outline",
};

export default async function DiscoveryRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let run;
  try {
    run = await getDiscoveryRun(active.workspace.id, id);
  } catch (error) {
    if (error instanceof DiscoveryRunNotFoundError) notFound();
    throw error;
  }

  const [items, errors, providerLogs, extractedCustomers, extractedProjects, extractedTenderBuyers, extractedTenderOpportunities, extractedVendorRegistrations, contactSummary] = await Promise.all([
    listDiscoveryRunItems(active.workspace.id, id),
    listErrorLogsForRun(active.workspace.id, id),
    listProviderLogsForRun(active.workspace.id, id),
    countCustomersForRun(active.workspace.id, id),
    countProjectsForRun(active.workspace.id, id),
    countTenderBuyersForRun(active.workspace.id, id),
    countTenderOpportunitiesForRun(active.workspace.id, id),
    countVendorRegistrationsForRun(active.workspace.id, id),
    getContactDiscoveryRunSummary(active.workspace.id, id),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/discovery-runs" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Discovery Runs
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {run.runType} run &middot; {run.searchType ?? "All types"}
          </h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Started {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
            {run.finishedAt && ` · Finished ${new Date(run.finishedAt).toLocaleString()}`}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[run.status] ?? "outline"}>{run.status}</Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Queries executed" value={run.queriesExecuted} />
        <StatCard label="Raw results found" value={run.rawResultsFound} />
        <StatCard label="Customers extracted" value={extractedCustomers} />
        <StatCard label="Projects extracted" value={extractedProjects} />
        <StatCard label="Tender buyers extracted" value={extractedTenderBuyers} />
        <StatCard label="Live tenders extracted" value={extractedTenderOpportunities} />
        <StatCard label="Vendor registrations extracted" value={extractedVendorRegistrations} />
        <StatCard label="Raw contact results" value={contactSummary.rawContactResults} />
        <StatCard label="Contacts extracted" value={contactSummary.contactsExtracted} />
        <StatCard label="Errors" value={run.errorsCount} />
      </div>

      {canManageDiscovery(active.role) && (run.searchType === "CUSTOMER" || !run.searchType) && (
        <div className="mt-6 flex justify-end">
          <ProcessCustomerResultsButton discoveryRunId={run.id} />
        </div>
      )}

      {canManageDiscovery(active.role) && (run.searchType === "PROJECT" || !run.searchType) && (
        <div className="mt-2 flex justify-end">
          <ProcessProjectResultsButton discoveryRunId={run.id} />
        </div>
      )}

      {canManageDiscovery(active.role) && (run.searchType === "TENDER" || !run.searchType) && (
        <div className="mt-2 flex justify-end">
          <ProcessTenderResultsButton discoveryRunId={run.id} />
        </div>
      )}

      {canManageDiscovery(active.role) && (run.searchType === "VENDOR_REGISTRATION" || !run.searchType) && (
        <div className="mt-2 flex justify-end">
          <ProcessVendorRegistrationResultsButton discoveryRunId={run.id} />
        </div>
      )}

      {canManageDiscovery(active.role) && (run.searchType === "CONTACT" || !run.searchType) && (
        <div className="mt-2 flex justify-end">
          <ProcessContactResultsButton discoveryRunId={run.id} />
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium">Queries in this run</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No queries were attempted in this run.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Raw results</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.query}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{item.country ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[item.status] ?? "outline"}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{item.rawResultsFound}</TableCell>
                    <TableCell className="max-w-xs truncate text-red-600 dark:text-red-400">{item.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium">Errors</h2>
          <div className="mt-3 flex flex-col gap-2">
            {errors.map((err) => (
              <div key={err.id} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{err.errorType}</span>
                  <Badge variant={err.retryable ? "warning" : "danger"}>{err.retryable ? "Retryable" : "Not retryable"}</Badge>
                </div>
                <p className="mt-1 text-black/60 dark:text-white/60">{err.errorMessage}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium">Provider logs</h2>
        {providerLogs.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No provider requests recorded for this run.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Query</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Est. cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.provider}</TableCell>
                    <TableCell className="max-w-xs truncate">{log.query}</TableCell>
                    <TableCell>
                      <Badge variant={log.status === "SUCCESS" ? "success" : "danger"}>{log.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{log.resultCount}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">${log.estimatedCost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
