import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveWorkspace, listActiveWorkspaceMembers } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listContacts } from "@/lib/contacts/service";
import { countOpenContactTasksByContactIds } from "@/lib/contacts/tasks";
import { isPubliclyDiscoveredContact } from "@/lib/contacts/normalize";
import { formatConfidenceScore } from "@/lib/contacts/scoring";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExportCsvLink } from "@/components/ui/export-csv-link";
import {
  CONTACT_ROLE_CATEGORIES,
  CONTACT_SENIORITIES,
  CONTACT_STATUSES,
  CONTACT_SOURCE_TYPES,
  CONTACT_ENRICHMENT_STATUSES,
  CONTACT_RECOMMENDED_ACTIONS,
  CONTACT_BEST_CONTACT_FOR_VALUES,
} from "@/models";

export const metadata: Metadata = { title: "Contacts" };

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  NEW: "outline",
  REVIEWED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CONTACTED: "warning",
  RESPONDED: "success",
  FOLLOW_UP: "warning",
  NOT_RELEVANT: "danger",
  ARCHIVED: "outline",
};

const PRIORITY_BADGE: Record<string, "success" | "warning" | "default" | "danger"> = {
  A_PLUS: "success",
  A: "success",
  B: "warning",
  C: "danger",
};
const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

const ENRICHMENT_BADGE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  COMPLETE: "success",
  NEEDS_EMAIL: "warning",
  NEEDS_PHONE: "warning",
  NEEDS_ROLE: "warning",
  NEEDS_VERIFICATION: "warning",
  NEEDS_LINKEDIN: "outline",
  NEEDS_COMPANY_LINK: "outline",
  LOW_CONFIDENCE: "danger",
  DO_NOT_CONTACT: "danger",
  ARCHIVED: "outline",
};

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    roleCategory?: string;
    department?: string;
    seniority?: string;
    country?: string;
    priority?: string;
    status?: string;
    sourceType?: string;
    duplicateStatus?: string;
    enrichmentStatus?: string;
    recommendedAction?: string;
    bestContactFor?: string;
    doNotContact?: string;
    assignedToUserId?: string;
    needsFollowUp?: string;
    overdueTasksOnly?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;

  const [{ contacts, total, page, totalPages }, members] = await Promise.all([
    listContacts(active.workspace.id, {
      q: params.q,
      roleCategory: params.roleCategory,
      department: params.department,
      seniority: params.seniority,
      country: params.country,
      priority: params.priority,
      status: params.status,
      sourceType: params.sourceType,
      duplicateStatus: params.duplicateStatus,
      enrichmentStatus: params.enrichmentStatus,
      recommendedAction: params.recommendedAction,
      bestContactFor: params.bestContactFor,
      doNotContact: params.doNotContact === "true" ? true : params.doNotContact === "false" ? false : undefined,
      assignedToUserId: params.assignedToUserId,
      needsFollowUp: params.needsFollowUp === "true",
      overdueTasksOnly: params.overdueTasksOnly === "true",
      page: Number(params.page) || 1,
    }),
    listActiveWorkspaceMembers(active.workspace.id),
  ]);

  const openTaskCounts = await countOpenContactTasksByContactIds(active.workspace.id, contacts.map((c) => c.id));

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.q ? { q: params.q } : {}),
      ...(params.roleCategory ? { roleCategory: params.roleCategory } : {}),
      ...(params.department ? { department: params.department } : {}),
      ...(params.seniority ? { seniority: params.seniority } : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.sourceType ? { sourceType: params.sourceType } : {}),
      ...(params.duplicateStatus ? { duplicateStatus: params.duplicateStatus } : {}),
      ...(params.enrichmentStatus ? { enrichmentStatus: params.enrichmentStatus } : {}),
      ...(params.recommendedAction ? { recommendedAction: params.recommendedAction } : {}),
      ...(params.bestContactFor ? { bestContactFor: params.bestContactFor } : {}),
      ...(params.doNotContact ? { doNotContact: params.doNotContact } : {}),
      ...(params.assignedToUserId ? { assignedToUserId: params.assignedToUserId } : {}),
      ...(params.needsFollowUp ? { needsFollowUp: params.needsFollowUp } : {}),
      ...(params.overdueTasksOnly ? { overdueTasksOnly: params.overdueTasksOnly } : {}),
      page: String(nextPage),
    });
    return `/dashboard/contacts?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Contacts"
        description="Procurement, purchase, sourcing, supply chain, vendor management, project, engineering, operations, commercial, contracts, and management contacts connected to discovered companies and opportunities."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/contacts" />
            {canManage && (
              <Link href="/dashboard/contact-discovery">
                <Button type="button" variant="outline" size="sm">
                  Discover Public Contacts
                </Button>
              </Link>
            )}
            {canManage && (
              <Link href="/dashboard/contacts/new">
                <Button type="button" size="sm">
                  Add Contact
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total contacts" value={total} />
        <StatCard label="This page" value={contacts.length} hint={`Page ${page} of ${totalPages}`} />
        <StatCard label="A+ on this page" value={contacts.filter((c) => c.priority === "A_PLUS").length} />
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard/contacts">
        <div className="min-w-[220px] flex-1">
          <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search name, company, email, designation..." />
        </div>
        <Select name="roleCategory" defaultValue={params.roleCategory ?? ""} className="w-auto">
          <option value="">All role categories</option>
          {CONTACT_ROLE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Input name="department" defaultValue={params.department ?? ""} placeholder="Department" className="w-32" />
        <Select name="seniority" defaultValue={params.seniority ?? ""} className="w-auto">
          <option value="">All seniorities</option>
          {CONTACT_SENIORITIES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
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
          {CONTACT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Select name="sourceType" defaultValue={params.sourceType ?? ""} className="w-auto">
          <option value="">All source types</option>
          {CONTACT_SOURCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Select name="duplicateStatus" defaultValue={params.duplicateStatus ?? ""} className="w-auto">
          <option value="">All duplicate statuses</option>
          <option value="UNIQUE">Unique</option>
          <option value="POSSIBLE_DUPLICATE">Possible duplicate</option>
          <option value="DUPLICATE">Duplicate</option>
          <option value="MERGED">Merged</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Select name="enrichmentStatus" defaultValue={params.enrichmentStatus ?? ""} className="w-auto">
          <option value="">All enrichment statuses</option>
          {CONTACT_ENRICHMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Select name="recommendedAction" defaultValue={params.recommendedAction ?? ""} className="w-auto">
          <option value="">All recommended actions</option>
          {CONTACT_RECOMMENDED_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Select name="bestContactFor" defaultValue={params.bestContactFor ?? ""} className="w-auto">
          <option value="">Best contact for: any</option>
          {CONTACT_BEST_CONTACT_FOR_VALUES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </Select>
        <Select name="doNotContact" defaultValue={params.doNotContact ?? ""} className="w-auto">
          <option value="">Do not contact: any</option>
          <option value="true">Do not contact only</option>
          <option value="false">Excluding do not contact</option>
        </Select>
        {members.length > 0 && (
          <Select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-auto">
            <option value="">Assigned to: anyone</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name ?? member.email}
              </option>
            ))}
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-black/70 dark:text-white/70">
          <input type="checkbox" name="needsFollowUp" value="true" defaultChecked={params.needsFollowUp === "true"} />
          Needs follow-up
        </label>
        <label className="flex items-center gap-1.5 text-sm text-black/70 dark:text-white/70">
          <input type="checkbox" name="overdueTasksOnly" value="true" defaultChecked={params.overdueTasksOnly === "true"} />
          Overdue tasks
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          className="mt-6"
          description={canManage ? "Add a contact manually, or link one from a Customer/Project/Tender/Vendor Registration detail page." : "Ask an owner, admin, manager, or user to add contacts."}
        />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Role Category</TableHead>
                <TableHead>Source Type</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enrichment</TableHead>
                <TableHead>Recommended Action</TableHead>
                <TableHead>Next Follow-up</TableHead>
                <TableHead>Open Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link href={`/dashboard/contacts/${contact.id}`} className="font-medium underline-offset-2 hover:underline">
                      {contact.fullName}
                    </Link>
                    {contact.doNotContact && (
                      <Badge variant="danger" className="ml-1.5">
                        DNC
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.companyName ?? "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-black/60 dark:text-white/60">{contact.designation ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="underline-offset-2 hover:underline">
                        {contact.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.phoneNumber ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.country ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{label(contact.roleCategory)}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {label(contact.sourceType)}
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-black/40 dark:text-white/40">
                      {isPubliclyDiscoveredContact(contact.sourceType) ? "(public)" : "(manual)"}
                    </span>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{formatConfidenceScore(contact.confidenceScore)}</TableCell>
                  <TableCell>
                    {contact.priority ? <Badge variant={PRIORITY_BADGE[contact.priority] ?? "default"}>{PRIORITY_LABEL[contact.priority]}</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[contact.status] ?? "outline"}>{label(contact.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ENRICHMENT_BADGE[contact.enrichmentStatus] ?? "outline"}>{label(contact.enrichmentStatus)}</Badge>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{label(contact.recommendedAction)}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {contact.nextFollowUpAt ? new Date(contact.nextFollowUpAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{openTaskCounts[contact.id] ?? 0}</TableCell>
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
