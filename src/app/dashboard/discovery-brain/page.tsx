import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { getDiscoveryBrain, getLatestDiscoveryStrategy, listDiscoveryQueue } from "@/lib/discovery-brain/service";
import { getLatestCoverageSnapshot } from "@/lib/discovery-brain/coverage";
import { listDiscoveryRuns } from "@/lib/discovery-brain/runs";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { GenerateQueueButton } from "@/components/discovery-brain/generate-queue-button";
import { RunDiscoveryNow } from "@/components/discovery-brain/run-discovery-now";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Discovery Brain" };

const SEARCH_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer discovery",
  PROJECT: "Project discovery",
  TENDER: "Tender discovery",
  VENDOR_REGISTRATION: "Vendor registration",
};

export default async function DiscoveryBrainPage() {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);

  const [discoveryBrain, strategy, snapshot, pendingItems, failedItems, recentRuns] = await Promise.all([
    getDiscoveryBrain(active.workspace.id),
    getLatestDiscoveryStrategy(active.workspace.id),
    getLatestCoverageSnapshot(active.workspace.id),
    listDiscoveryQueue(active.workspace.id, { status: "QUEUED" }),
    listDiscoveryQueue(active.workspace.id, { status: "FAILED" }),
    listDiscoveryRuns(active.workspace.id, 5),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Discovery Brain"
        description="Plans what to search next for global discovery coverage — nothing here runs a search yet, it only plans, queues, and tracks coverage."
        action={canManage ? <GenerateQueueButton /> : undefined}
      />

      {!discoveryBrain ? (
        <EmptyState
          title="No discovery queue yet"
          description={
            canManage
              ? "Generate a discovery queue to plan customer, project, tender, and vendor-registration searches from your Business Brain."
              : "Ask an owner, admin, manager, or user to generate the discovery queue."
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {canManage && (
            <section>
              <h2 className="text-sm font-medium">Run Discovery Now</h2>
              <div className="mt-3">
                <RunDiscoveryNow />
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-medium">Strategy summary</h2>
            <div className="mt-3 rounded-xl border border-black/[.08] p-4 text-sm dark:border-white/[.145]">
              <p className="text-black/70 dark:text-white/70">
                {strategy?.summary ?? "No strategy recorded yet."}
              </p>
              {discoveryBrain.lastQueueGeneratedAt && (
                <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                  Queue last generated {discoveryBrain.lastQueueGeneratedAt.toLocaleString()}
                </p>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Search queries" value={discoveryBrain.totalSearchQueries} />
            <StatCard label="Queue items" value={discoveryBrain.totalQueueItems} />
            <StatCard label="Pending searches" value={pendingItems.length} />
            <StatCard label="Failed searches" value={failedItems.length} />
          </section>

          <section>
            <h2 className="text-sm font-medium">Coverage by country</h2>
            {snapshot ? (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label="Countries searched" value={snapshot.countriesSearched} />
                <StatCard label="Countries pending" value={snapshot.countriesPending} />
                <StatCard label="Countries needing refresh" value={snapshot.countriesNeedingRefresh} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-black/50 dark:text-white/50">
                No coverage computed yet — generate the discovery queue first.
              </p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h2 className="text-sm font-medium">Products &amp; industries</h2>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <StatCard label="Products/services searched" value={snapshot?.productsSearched ?? 0} />
                <StatCard label="Industries searched" value={snapshot?.industriesSearched ?? 0} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-medium">Sources</h2>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <StatCard label="Sources searched" value={snapshot?.sourcesSearched ?? 0} />
                <StatCard label="Sources pending" value={snapshot?.sourcesPending ?? 0} />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Coverage by search type</h2>
              {snapshot && <Badge variant="outline">{snapshot.coveragePercentage}% overall</Badge>}
            </div>
            {snapshot && Object.keys(snapshot.bySearchType).length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(snapshot.bySearchType).map(([type, stats]) => (
                  <StatCard
                    key={type}
                    label={SEARCH_TYPE_LABELS[type] ?? type}
                    value={`${stats.completed}/${stats.total}`}
                    hint="completed / planned"
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-black/50 dark:text-white/50">No search queries planned yet.</p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Recent discovery runs</h2>
              <div className="flex items-center gap-3 text-xs">
                <Link href="/dashboard/discovery-runs" className="underline underline-offset-2">
                  All runs
                </Link>
                <Link href="/dashboard/raw-search-results" className="underline underline-offset-2">
                  Raw search results
                </Link>
              </div>
            </div>
            {recentRuns.length === 0 ? (
              <p className="mt-3 text-sm text-black/50 dark:text-white/50">No discovery run has been executed yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/dashboard/discovery-runs/${run.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[.08] p-3 text-sm hover:bg-black/[.02] dark:border-white/[.145] dark:hover:bg-white/[.04]"
                  >
                    <span>
                      {run.runType} &middot; {run.searchType ? SEARCH_TYPE_LABELS[run.searchType] : "All types"}
                    </span>
                    <span className="text-black/50 dark:text-white/50">
                      {run.queriesExecuted} queries, {run.rawResultsFound} results, {run.errorsCount} errors
                    </span>
                    <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>
                      {run.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
