import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listDuplicateRecords } from "@/lib/dedup/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExportCsvLink } from "@/components/ui/export-csv-link";
import { RunDeduplicationButton } from "@/components/duplicates/run-deduplication-button";
import { DuplicateRowActions } from "@/components/duplicates/duplicate-row-actions";

export const metadata: Metadata = { title: "Duplicates" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  PENDING_REVIEW: "warning",
  AUTO_MERGED: "success",
  MANUALLY_MERGED: "success",
  NOT_DUPLICATE: "outline",
  REJECTED: "danger",
  ARCHIVED: "outline",
};

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

type DuplicateSideRecord = {
  id: string;
  score: number;
  priority: string | null;
  priorityScore?: number;
  status: string;
  sourceUrl: string | null;
  sourceHistory: unknown[];
  lastVerifiedAt: Date | string | null;
  // Customer fields
  customerName?: string;
  country?: string | null;
  website?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  // Project fields
  clientName?: string;
  projectName?: string;
  location?: string | null;
  contractorName?: string | null;
  timeline?: string | null;
  projectInformationLink?: string | null;
  projectStage?: string;
  // Tender buyer fields
  websiteDomain?: string | null;
  tenderWebsiteLink?: string | null;
  // Tender opportunity fields
  buyerOrganization?: string;
  tenderTitle?: string;
  tenderLink?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  productsServicesRequired?: string[];
  // Vendor registration fields
  vendorRegistrationLink?: string | null;
  registrationType?: string | null;
  requiredDocuments?: string[];
};

const DETAIL_HREF_BY_TYPE: Record<string, string> = {
  PROJECT: "/dashboard/projects",
  TENDER_BUYER: "/dashboard/tender-buyers",
  TENDER_OPPORTUNITY: "/dashboard/live-tenders",
  VENDOR_REGISTRATION: "/dashboard/vendor-registrations",
};

/** Side-by-side comparison for one side of a duplicate pair — renders customer/project/tender-buyer/tender-opportunity fields depending on the pair's recordType (Phase 9/10: extended beyond customers). */
function RecordColumn({ label, recordType, record }: { label: string; recordType: string; record: DuplicateSideRecord | null }) {
  if (!record) {
    return (
      <div className="flex-1">
        <p className="text-xs font-medium text-black/50 dark:text-white/50">{label}</p>
        <p className="mt-2 text-sm text-black/40 dark:text-white/40">Record no longer available.</p>
      </div>
    );
  }

  const detailHref = `${DETAIL_HREF_BY_TYPE[recordType] ?? "/dashboard/customers"}/${record.id}`;
  const title =
    recordType === "PROJECT"
      ? (record.projectName ?? "Untitled project")
      : recordType === "TENDER_OPPORTUNITY"
        ? (record.tenderTitle ?? "Untitled tender")
        : (record.customerName ?? "Unnamed customer");

  return (
    <div className="flex-1">
      <p className="text-xs font-medium text-black/50 dark:text-white/50">{label}</p>
      <Link href={detailHref} className="mt-1 block font-medium underline-offset-2 hover:underline">
        {title}
      </Link>
      <dl className="mt-2 space-y-1 text-xs text-black/60 dark:text-white/60">
        {recordType === "PROJECT" && (
          <>
            <div>Client: {record.clientName ?? "—"}</div>
            <div>Location: {record.location ?? "—"}</div>
            <div>Country: {record.country ?? "—"}</div>
            <div>Contractor: {record.contractorName ?? "—"}</div>
            <div>Timeline: {record.timeline ?? "—"}</div>
            <div>Stage: {record.projectStage ?? "—"}</div>
            <div className="truncate">Project link: {record.projectInformationLink ?? "—"}</div>
          </>
        )}
        {recordType === "TENDER_BUYER" && (
          <>
            <div>Country: {record.country ?? "—"}</div>
            <div>Website: {record.website ?? "—"}</div>
            <div className="truncate">Tender website link: {record.tenderWebsiteLink ?? "—"}</div>
            <div>Address: {record.address ?? "—"}</div>
            <div>Phone: {record.phoneNumber ?? "—"}</div>
          </>
        )}
        {recordType === "TENDER_OPPORTUNITY" && (
          <>
            <div>Buyer org: {record.buyerOrganization ?? "—"}</div>
            <div className="truncate">Tender link: {record.tenderLink ?? "—"}</div>
            <div>Start date: {record.startDate ? new Date(record.startDate).toLocaleDateString() : "—"}</div>
            <div>End date: {record.endDate ? new Date(record.endDate).toLocaleDateString() : "—"}</div>
            <div>Country: {record.country ?? "—"}</div>
            <div>Products/services: {record.productsServicesRequired?.join(", ") || "—"}</div>
          </>
        )}
        {recordType === "VENDOR_REGISTRATION" && (
          <>
            <div>Country: {record.country ?? "—"}</div>
            <div>Website: {record.website ?? "—"}</div>
            <div className="truncate">Vendor registration link: {record.vendorRegistrationLink ?? "—"}</div>
            <div>Registration type: {record.registrationType ?? "—"}</div>
            <div>Required documents: {record.requiredDocuments?.join(", ") || "—"}</div>
            <div>Address: {record.address ?? "—"}</div>
            <div>Phone: {record.phoneNumber ?? "—"}</div>
          </>
        )}
        {recordType !== "PROJECT" && recordType !== "TENDER_BUYER" && recordType !== "TENDER_OPPORTUNITY" && recordType !== "VENDOR_REGISTRATION" && (
          <>
            <div>Country: {record.country ?? "—"}</div>
            <div>Website: {record.website ?? "—"}</div>
            <div>Address: {record.address ?? "—"}</div>
            <div>Phone: {record.phoneNumber ?? "—"}</div>
          </>
        )}
        <div>
          Score: {Math.round(record.score ?? record.priorityScore ?? 0)} · Priority: {record.priority ?? "—"}
        </div>
        <div>Status: {record.status}</div>
        <div className="truncate">Source URL: {record.sourceUrl ?? "—"}</div>
        <div>Sources: {record.sourceHistory.length}</div>
        <div>Last verified: {record.lastVerifiedAt ? new Date(record.lastVerifiedAt).toLocaleDateString() : "—"}</div>
      </dl>
    </div>
  );
}

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    recordType?: string;
    status?: string;
    minScore?: string;
    maxScore?: string;
    createdAfter?: string;
    createdBefore?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const { records, total, page, totalPages } = await listDuplicateRecords(active.workspace.id, {
    recordType: params.recordType,
    status: params.status,
    minScore: params.minScore ? Number(params.minScore) : undefined,
    maxScore: params.maxScore ? Number(params.maxScore) : undefined,
    createdAfter: params.createdAfter ? new Date(params.createdAfter) : undefined,
    createdBefore: params.createdBefore ? new Date(params.createdBefore) : undefined,
    page: Number(params.page) || 1,
  });

  const pendingCount = records.filter((r) => r.status === "PENDING_REVIEW").length;

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.recordType ? { recordType: params.recordType } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.minScore ? { minScore: params.minScore } : {}),
      ...(params.maxScore ? { maxScore: params.maxScore } : {}),
      ...(params.createdAfter ? { createdAfter: params.createdAfter } : {}),
      ...(params.createdBefore ? { createdBefore: params.createdBefore } : {}),
      page: String(nextPage),
    });
    return `/dashboard/duplicates?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Duplicates"
        description="Likely-duplicate record pairs found by the deduplication engine — review, merge, or dismiss each one. Customers, projects, tender buyers, live tenders, and vendor registrations are all supported today."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/duplicates" />
            {canManage && <RunDeduplicationButton />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total pairs (this page)" value={records.length} />
        <StatCard label="Pending review (this page)" value={pendingCount} />
        <StatCard label="Total pairs" value={total} />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/duplicates">
        <Select name="recordType" defaultValue={params.recordType ?? ""} className="w-auto">
          <option value="">All record types</option>
          <option value="CUSTOMER">Customer</option>
          <option value="PROJECT">Project</option>
          <option value="TENDER_BUYER">Tender buyer</option>
          <option value="TENDER_OPPORTUNITY">Tender opportunity</option>
          <option value="VENDOR_REGISTRATION">Vendor registration</option>
        </Select>
        <Select name="status" defaultValue={params.status ?? ""} className="w-auto">
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending review</option>
          <option value="AUTO_MERGED">Auto merged</option>
          <option value="MANUALLY_MERGED">Manually merged</option>
          <option value="NOT_DUPLICATE">Not duplicate</option>
          <option value="REJECTED">Rejected</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Input name="minScore" type="number" min={0} max={100} defaultValue={params.minScore ?? ""} placeholder="Min score" className="w-28" />
        <Input name="maxScore" type="number" min={0} max={100} defaultValue={params.maxScore ?? ""} placeholder="Max score" className="w-28" />
        <Input name="createdAfter" type="date" defaultValue={params.createdAfter ?? ""} className="w-auto" />
        <Input name="createdBefore" type="date" defaultValue={params.createdBefore ?? ""} className="w-auto" />
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {records.length === 0 ? (
        <EmptyState
          title="No duplicate pairs match your filters"
          className="mt-6"
          description={canManage ? "Run deduplication to scan your customers for likely duplicates." : "Ask an owner, admin, manager, or user to run deduplication."}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {records.map((record) => (
            <div key={record.id} className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                  <Badge variant="outline">{record.recordType}</Badge>
                  <span>Score {record.duplicateScore}</span>
                  <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                </div>
                <Badge variant={STATUS_BADGE[record.status] ?? "outline"}>{statusLabel(record.status)}</Badge>
              </div>

              {record.duplicateReason && <p className="mt-2 text-sm text-black/70 dark:text-white/70">{record.duplicateReason}</p>}

              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {record.matchingFields.length > 0 && (
                  <span className="text-black/50 dark:text-white/50">Matching: {record.matchingFields.join(", ")}</span>
                )}
                {record.conflictingFields.length > 0 && (
                  <span className="text-red-600 dark:text-red-400">Conflicting: {record.conflictingFields.join(", ")}</span>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6">
                <RecordColumn label="Primary" recordType={record.recordType} record={record.primary as DuplicateSideRecord | null} />
                <RecordColumn label="Possible duplicate" recordType={record.recordType} record={record.duplicate as DuplicateSideRecord | null} />
              </div>

              {canManage && (
                <div className="mt-4">
                  <DuplicateRowActions id={record.id} status={record.status} />
                </div>
              )}
            </div>
          ))}
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
