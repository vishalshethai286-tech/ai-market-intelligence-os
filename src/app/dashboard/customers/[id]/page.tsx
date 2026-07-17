import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { RelatedContactsSection } from "@/components/contacts/related-contacts-section";
import { getCustomer, CustomerNotFoundError } from "@/lib/customers/service";
import { countPendingDuplicatesForRecord, listFieldChangeHistory } from "@/lib/dedup/service";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { CustomerDetailActions } from "@/components/customers/customer-detail-actions";

export const metadata: Metadata = { title: "Customer detail" };

const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let customer;
  try {
    customer = await getCustomer(active.workspace.id, id);
  } catch (error) {
    if (error instanceof CustomerNotFoundError) notFound();
    throw error;
  }

  const [pendingDuplicates, fieldChanges] = await Promise.all([
    countPendingDuplicatesForRecord(active.workspace.id, "CUSTOMER", customer.id),
    listFieldChangeHistory(active.workspace.id, "CUSTOMER", customer.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/customers" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Customers
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{customer.customerName}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {customer.country ?? "Unknown country"}
            {customer.duplicateStatus !== "UNIQUE" && ` · ${customer.duplicateStatus.replace(/_/g, " ").toLowerCase()}`}
          </p>
        </div>
        <Badge>{customer.status}</Badge>
      </div>

      {pendingDuplicates > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span>
            {pendingDuplicates} possible duplicate{pendingDuplicates === 1 ? "" : "s"} pending review.
          </span>
          <Link href={`/dashboard/duplicates?status=PENDING_REVIEW`} className="font-medium underline-offset-2 hover:underline">
            Review in Duplicates &rarr;
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Score" value={Math.round(customer.score)} />
        <StatCard label="Priority" value={customer.priority ? PRIORITY_LABEL[customer.priority] : "—"} />
        <StatCard label="Confidence" value={`${Math.round(customer.confidenceScore * 100)}%`} />
        <StatCard label="Sources" value={customer.sourceHistory.length} />
      </div>

      {canManageDiscovery(active.role) && (
        <div className="mt-8">
          <CustomerDetailActions id={customer.id} status={customer.status} />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-black/[.08] p-4 sm:grid-cols-2 dark:border-white/[.145]">
        <Field label="Website" value={customer.website} />
        <Field label="Address" value={customer.address} />
        <Field label="Phone number" value={customer.phoneNumber} />
        <Field label="Matched product/service" value={customer.matchedProductServiceName} />
        <Field label="Matched industry" value={customer.matchedIndustry} />
        <Field label="Buyer type" value={customer.buyerType} />
        <Field label="Last verified" value={customer.lastVerifiedAt ? new Date(customer.lastVerifiedAt).toLocaleString() : null} />
        <Field
          label="Source result"
          value={customer.sourceUrl}
        />
      </dl>

      {customer.aiRelevanceExplanation && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">AI relevance explanation</h2>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">{customer.aiRelevanceExplanation}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium">Source history ({customer.sourceHistory.length})</h2>
        {customer.sourceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No sources recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {customer.sourceHistory.map((entry, index) => (
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

      {fieldChanges.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Field change history ({fieldChanges.length})</h2>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">Values updated by a deduplication merge, with the source that justified each change.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {fieldChanges.map((change) => (
              <li key={change.id} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{change.fieldName}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">{new Date(change.capturedAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                  {change.oldValue || "(empty)"} &rarr; {change.newValue || "(empty)"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RelatedContactsSection
        workspaceId={active.workspace.id}
        recordType="TARGET_CUSTOMER"
        recordId={customer.id}
        recordLabel={customer.customerName}
        canManage={canManageDiscovery(active.role)}
      />
    </div>
  );
}
