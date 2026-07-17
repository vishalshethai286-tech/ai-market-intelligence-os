import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { RelatedContactsSection } from "@/components/contacts/related-contacts-section";
import { getTenderOpportunity, TenderOpportunityNotFoundError } from "@/lib/tenders/opportunity-service";
import { countPendingDuplicatesForRecord } from "@/lib/dedup/service";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { TenderOpportunityDetailActions } from "@/components/tenders/tender-opportunity-detail-actions";

export const metadata: Metadata = { title: "Live tender detail" };

const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function TenderOpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let opportunity;
  try {
    opportunity = await getTenderOpportunity(active.workspace.id, id);
  } catch (error) {
    if (error instanceof TenderOpportunityNotFoundError) notFound();
    throw error;
  }

  const pendingDuplicates = await countPendingDuplicatesForRecord(active.workspace.id, "TENDER_OPPORTUNITY", opportunity.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/live-tenders" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Live Tenders
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{opportunity.tenderTitle}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {opportunity.buyerOrganization} · {opportunity.country ?? "Unknown country"}
            {opportunity.duplicateStatus !== "UNIQUE" && ` · ${opportunity.duplicateStatus.replace(/_/g, " ").toLowerCase()}`}
          </p>
        </div>
        <Badge>{opportunity.status.replace(/_/g, " ")}</Badge>
      </div>

      {pendingDuplicates > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span>
            {pendingDuplicates} possible duplicate{pendingDuplicates === 1 ? "" : "s"} pending review.
          </span>
          <Link href="/dashboard/duplicates?status=PENDING_REVIEW&recordType=TENDER_OPPORTUNITY" className="font-medium underline-offset-2 hover:underline">
            Review in Duplicates &rarr;
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Priority score" value={Math.round(opportunity.priorityScore)} />
        <StatCard label="Priority" value={opportunity.priority ? PRIORITY_LABEL[opportunity.priority] : "—"} />
        <StatCard label="Sources" value={opportunity.sourceHistory.length} />
        <StatCard label="Last verified" value={opportunity.lastVerifiedAt ? new Date(opportunity.lastVerifiedAt).toLocaleDateString() : "—"} />
      </div>

      {canManageDiscovery(active.role) && (
        <div className="mt-8">
          <TenderOpportunityDetailActions id={opportunity.id} status={opportunity.status} />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-black/[.08] p-4 sm:grid-cols-2 dark:border-white/[.145]">
        <Field label="Customer name" value={opportunity.customerName} />
        <Field label="Buyer organization" value={opportunity.buyerOrganization} />
        <Field label="Start date" value={opportunity.startDate ? new Date(opportunity.startDate).toLocaleDateString() : null} />
        <Field label="End date" value={opportunity.endDate ? new Date(opportunity.endDate).toLocaleDateString() : null} />
        <Field label="Tender link" value={opportunity.tenderLink} />
        <Field label="Country" value={opportunity.country} />
        <Field label="Products/services required" value={opportunity.productsServicesRequired.join(", ") || null} />
        <Field label="Matched product/service" value={opportunity.matchedProductServiceName} />
        <Field label="Source URL" value={opportunity.sourceUrl} />
      </dl>

      {opportunity.tenderDescription && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">Tender description</h2>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">{opportunity.tenderDescription}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium">Source history ({opportunity.sourceHistory.length})</h2>
        {opportunity.sourceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No sources recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {opportunity.sourceHistory.map((entry, index) => (
              <li key={`${entry.rawSearchResultId}-${index}`} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <a href={entry.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {entry.url}
                </a>
                <div className="mt-1 flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                  <span>{new Date(entry.retrievedAt).toLocaleString()}</span>
                  <Link href={`/dashboard/discovery-runs/${entry.discoveryRunId}`} className="underline-offset-2 hover:underline">
                    View discovery run
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RelatedContactsSection
        workspaceId={active.workspace.id}
        recordType="TENDER_OPPORTUNITY"
        recordId={opportunity.id}
        recordLabel={opportunity.tenderTitle}
        canManage={canManageDiscovery(active.role)}
      />
    </div>
  );
}
