import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { RelatedContactsSection } from "@/components/contacts/related-contacts-section";
import { getTenderBuyer, TenderBuyerNotFoundError } from "@/lib/tenders/buyer-service";
import { countPendingDuplicatesForRecord } from "@/lib/dedup/service";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { TenderBuyerDetailActions } from "@/components/tenders/tender-buyer-detail-actions";

export const metadata: Metadata = { title: "Tender buyer detail" };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function TenderBuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let buyer;
  try {
    buyer = await getTenderBuyer(active.workspace.id, id);
  } catch (error) {
    if (error instanceof TenderBuyerNotFoundError) notFound();
    throw error;
  }

  const pendingDuplicates = await countPendingDuplicatesForRecord(active.workspace.id, "TENDER_BUYER", buyer.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/tender-buyers" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Tender Buyers
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{buyer.customerName}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {buyer.country ?? "Unknown country"}
            {buyer.duplicateStatus !== "UNIQUE" && ` · ${buyer.duplicateStatus.replace(/_/g, " ").toLowerCase()}`}
          </p>
        </div>
        <Badge>{buyer.status}</Badge>
      </div>

      {pendingDuplicates > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span>
            {pendingDuplicates} possible duplicate{pendingDuplicates === 1 ? "" : "s"} pending review.
          </span>
          <Link href="/dashboard/duplicates?status=PENDING_REVIEW&recordType=TENDER_BUYER" className="font-medium underline-offset-2 hover:underline">
            Review in Duplicates &rarr;
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <StatCard label="Sources" value={buyer.sourceHistory.length} />
        <StatCard label="Last verified" value={buyer.lastVerifiedAt ? new Date(buyer.lastVerifiedAt).toLocaleDateString() : "—"} />
      </div>

      {canManageDiscovery(active.role) && (
        <div className="mt-8">
          <TenderBuyerDetailActions id={buyer.id} status={buyer.status} />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-black/[.08] p-4 sm:grid-cols-2 dark:border-white/[.145]">
        <Field label="Country" value={buyer.country} />
        <Field label="Address" value={buyer.address} />
        <Field label="Phone number" value={buyer.phoneNumber} />
        <Field label="Website" value={buyer.website} />
        <Field label="Tender website link" value={buyer.tenderWebsiteLink} />
        <Field label="Source URL" value={buyer.sourceUrl} />
      </dl>

      <div className="mt-8">
        <h2 className="text-sm font-medium">Source history ({buyer.sourceHistory.length})</h2>
        {buyer.sourceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No sources recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {buyer.sourceHistory.map((entry, index) => (
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
        recordType="TENDER_BUYER"
        recordId={buyer.id}
        recordLabel={buyer.customerName}
        canManage={canManageDiscovery(active.role)}
      />
    </div>
  );
}
