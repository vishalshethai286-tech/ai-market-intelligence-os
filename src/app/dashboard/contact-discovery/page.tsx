import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import {
  listContactDiscoveryTargets,
  getContactDiscoveryStats,
  listRecentContactRawResults,
} from "@/lib/contact-discovery/service";
import { listContacts } from "@/lib/contacts/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ContactDiscoveryActions } from "@/components/contact-discovery/contact-discovery-actions";

export const metadata: Metadata = { title: "Contact Discovery" };

const TARGET_STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  NEW: "outline",
  QUEUED: "warning",
  SEARCHING: "warning",
  SEARCHED: "outline",
  CONTACTS_FOUND: "success",
  NO_CONTACTS_FOUND: "outline",
  FAILED: "danger",
  ARCHIVED: "outline",
};

const RELATED_RECORD_LABELS: Record<string, string> = {
  TARGET_CUSTOMER: "Target Customer",
  PROJECT_OPPORTUNITY: "Project Opportunity",
  TENDER_BUYER: "Tender Buyer",
  TENDER_OPPORTUNITY: "Tender Opportunity",
  VENDOR_REGISTRATION: "Vendor Registration",
  MANUAL_COMPANY: "Manual Company",
};

const EXTRACTION_STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  NOT_STARTED: "outline",
  PENDING: "warning",
  EXTRACTED: "success",
  FAILED: "danger",
  SKIPPED: "outline",
};

export default async function ContactDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ relatedRecordType?: string; country?: string; priority?: string; status?: string; page?: string }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const [stats, { targets, total, page, totalPages }, recentRawResults, { contacts: recentContacts }] = await Promise.all([
    getContactDiscoveryStats(active.workspace.id),
    listContactDiscoveryTargets(active.workspace.id, {
      relatedRecordType: params.relatedRecordType,
      country: params.country,
      priority: params.priority,
      status: params.status,
      page: Number(params.page) || 1,
    }),
    listRecentContactRawResults(active.workspace.id, 20),
    listContacts(active.workspace.id, { sortBy: "createdAt", sortDir: "desc", pageSize: 20 }),
  ]);

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.relatedRecordType ? { relatedRecordType: params.relatedRecordType } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.status ? { status: params.status } : {}),
      page: String(nextPage),
    });
    return `/dashboard/contact-discovery?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Contact Discovery"
        description="Finds procurement, purchase, sourcing, vendor management, project, engineering, contracts, and management contacts from safe public sources — company websites, contact/team pages, supplier portals, tender documents, and public directories. Never scrapes or automates LinkedIn."
        action={canManage ? <ContactDiscoveryActions /> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Discovery targets" value={stats.totalTargets} />
        <StatCard label="Queued searches" value={stats.queuedSearches} />
        <StatCard label="Raw results pending extraction" value={stats.rawResultsPendingExtraction} />
        <StatCard label="Public contacts discovered" value={stats.publicContactsDiscovered} />
        <StatCard label="Contacts created today" value={stats.contactsDiscoveredToday} />
        <StatCard label="Contacts updated today" value={stats.contactsUpdatedToday} />
        <StatCard label="Failed extractions" value={stats.failedExtractions} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Contact Discovery Targets</h2>
      <form className="flex flex-wrap items-end gap-3" action="/dashboard/contact-discovery">
        <Select name="relatedRecordType" defaultValue={params.relatedRecordType ?? ""} className="w-auto">
          <option value="">All related record types</option>
          {Object.entries(RELATED_RECORD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select name="country" defaultValue={params.country ?? ""} className="w-auto">
          <option value="">All countries</option>
        </Select>
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
          <option value="QUEUED">Queued</option>
          <option value="SEARCHING">Searching</option>
          <option value="SEARCHED">Searched</option>
          <option value="CONTACTS_FOUND">Contacts Found</option>
          <option value="NO_CONTACTS_FOUND">No Contacts Found</option>
          <option value="FAILED">Failed</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {targets.length === 0 ? (
        <EmptyState
          title="No contact discovery targets yet"
          className="mt-6"
          description={
            canManage
              ? "Generate contact discovery targets from your existing customers, projects, tenders, and vendor registrations to get started."
              : "Ask an owner, admin, or manager to generate contact discovery targets."
          }
        />
      ) : (
        <div className="mt-6 rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Related Record Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contacts Found</TableHead>
                <TableHead>Last Queued At</TableHead>
                <TableHead>Last Searched At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((target) => (
                <TableRow key={target.id}>
                  <TableCell className="font-medium">{target.companyName}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{target.country ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{RELATED_RECORD_LABELS[target.relatedRecordType] ?? target.relatedRecordType}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{target.priority.replace("_PLUS", "+")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={TARGET_STATUS_BADGE[target.status] ?? "outline"}>{target.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{target.contactsFound}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {target.lastQueuedAt ? new Date(target.lastQueuedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {target.lastSearchedAt ? new Date(target.lastSearchedAt).toLocaleDateString() : "—"}
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
            Page {page} of {totalPages} ({total} total)
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

      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent Raw Contact Results</h2>
      {recentRawResults.length === 0 ? (
        <EmptyState title="No raw contact search results yet" description="Run a contact search to populate this list." />
      ) : (
        <div className="rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Search Query</TableHead>
                <TableHead>Extraction Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRawResults.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="max-w-[280px] truncate">
                    <a href={result.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {result.title}
                    </a>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{result.relatedCompanyName ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-black/60 dark:text-white/60">{result.query}</TableCell>
                  <TableCell>
                    <Badge variant={EXTRACTION_STATUS_BADGE[result.extractionStatus] ?? "outline"}>{result.extractionStatus.replace(/_/g, " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent Discovered Contacts</h2>
      {recentContacts.length === 0 ? (
        <EmptyState title="No contacts discovered yet" description="Process contact results once raw search results come in." />
      ) : (
        <div className="rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Role Category</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentContacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link href={`/dashboard/contacts/${contact.id}`} className="font-medium underline-offset-2 hover:underline">
                      {contact.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.companyName ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.designation ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.roleCategory.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.email ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.phoneNumber ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{(contact.priority ?? "C").replace("_PLUS", "+")}</Badge>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.status.replace(/_/g, " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
