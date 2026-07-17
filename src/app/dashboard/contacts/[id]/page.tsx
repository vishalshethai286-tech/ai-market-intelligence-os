import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace, listActiveWorkspaceMembers } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { getContactById, getContactActivities, groupContactActivitiesByDate, ContactNotFoundError } from "@/lib/contacts/service";
import { formatConfidenceScore } from "@/lib/contacts/scoring";
import { isPubliclyDiscoveredContact } from "@/lib/contacts/normalize";
import { listContactTasks } from "@/lib/contacts/tasks";
import { listContactEmailTemplates, seedDefaultContactEmailTemplates } from "@/lib/contacts/email-drafts";
import { getCustomer } from "@/lib/customers/service";
import { getProject } from "@/lib/projects/service";
import { getTenderBuyer } from "@/lib/tenders/buyer-service";
import { getTenderOpportunity } from "@/lib/tenders/opportunity-service";
import { getVendorRegistration } from "@/lib/vendor-registrations/service";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { ContactDetailActions } from "@/components/contacts/contact-detail-actions";
import { ContactCrmActions } from "@/components/contacts/contact-crm-actions";
import { ContactActivityForm } from "@/components/contacts/contact-activity-form";
import { ContactLinkForm } from "@/components/contacts/contact-link-form";
import { ContactTasksSection } from "@/components/contacts/contact-tasks-section";
import { ContactEmailDraftPanel } from "@/components/contacts/contact-email-draft-panel";
import { ContactRecommendationsSection } from "@/components/contacts/contact-recommendations-section";

export const metadata: Metadata = { title: "Contact detail" };

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

function Field({ label: fieldLabel, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-black/50 dark:text-white/50">{fieldLabel}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  FOLLOW_UP: "Follow up",
  STATUS_CHANGE: "Status change",
  VERIFICATION: "Verification",
  MANUAL_UPDATE: "Manual update",
  OTHER: "Other",
};

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

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let contact;
  try {
    contact = await getContactById(active.workspace.id, id);
  } catch (error) {
    if (error instanceof ContactNotFoundError) notFound();
    throw error;
  }

  await seedDefaultContactEmailTemplates(active.workspace.id);

  const [
    activities,
    relatedCustomer,
    relatedProject,
    relatedTenderBuyer,
    relatedTenderOpportunity,
    relatedVendorRegistration,
    { tasks },
    templates,
    members,
  ] = await Promise.all([
    getContactActivities(active.workspace.id, contact.id),
    contact.relatedTargetCustomerId ? getCustomer(active.workspace.id, contact.relatedTargetCustomerId).catch(() => null) : null,
    contact.relatedProjectOpportunityId ? getProject(active.workspace.id, contact.relatedProjectOpportunityId).catch(() => null) : null,
    contact.relatedTenderBuyerId ? getTenderBuyer(active.workspace.id, contact.relatedTenderBuyerId).catch(() => null) : null,
    contact.relatedTenderOpportunityId ? getTenderOpportunity(active.workspace.id, contact.relatedTenderOpportunityId).catch(() => null) : null,
    contact.relatedVendorRegistrationId ? getVendorRegistration(active.workspace.id, contact.relatedVendorRegistrationId).catch(() => null) : null,
    listContactTasks(active.workspace.id, { contactId: contact.id, pageSize: 100 }),
    listContactEmailTemplates(active.workspace.id),
    listActiveWorkspaceMembers(active.workspace.id),
  ]);

  const canManage = canManageDiscovery(active.role);
  const activityGroups = groupContactActivitiesByDate(activities);
  const isFollowUpOverdue = Boolean(contact.nextFollowUpAt && new Date(contact.nextFollowUpAt) < new Date());

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/contacts" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Contacts
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{contact.fullName}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {contact.designation ?? "Unknown designation"}
            {contact.companyName && ` · ${contact.companyName}`}
            {contact.duplicateStatus !== "UNIQUE" && ` · ${label(contact.duplicateStatus)}`}
            {" · "}
            {isPubliclyDiscoveredContact(contact.sourceType) ? "Publicly discovered" : "Manually added"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link href={`/dashboard/contacts/${contact.id}/edit`}>
              <Badge variant="outline">Edit Contact</Badge>
            </Link>
          )}
          <Badge>{label(contact.status)}</Badge>
          {contact.doNotContact && <Badge variant="danger">Do Not Contact</Badge>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Priority score" value={Math.round(contact.priorityScore)} />
        <StatCard label="Priority" value={contact.priority ?? "—"} />
        <StatCard label="Confidence" value={formatConfidenceScore(contact.confidenceScore)} />
        <StatCard
          label="Next follow-up"
          value={contact.nextFollowUpAt ? new Date(contact.nextFollowUpAt).toLocaleDateString() : "—"}
          hint={isFollowUpOverdue ? "Overdue" : undefined}
        />
      </div>
      {isFollowUpOverdue && (
        <p className="mt-2 rounded-lg bg-red-600/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          Follow-up is overdue — was due {new Date(contact.nextFollowUpAt as Date).toLocaleDateString()}.
        </p>
      )}

      {canManage && (
        <div className="mt-8">
          <ContactDetailActions id={contact.id} status={contact.status} />
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-medium">Enrichment summary</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={ENRICHMENT_BADGE[contact.enrichmentStatus] ?? "outline"}>{label(contact.enrichmentStatus)}</Badge>
          <span className="text-sm text-black/60 dark:text-white/60">Enrichment score: {contact.enrichmentScore}/100</span>
        </div>
        <p className="mt-2 text-sm">
          <span className="font-medium">Recommended action:</span> {label(contact.recommendedAction)}
          {contact.recommendedActionReason && <span className="text-black/60 dark:text-white/60"> — {contact.recommendedActionReason}</span>}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-medium">Best contact for:</span> {contact.bestContactFor ? label(contact.bestContactFor) : "—"}
        </p>
        {contact.missingFields.length > 0 && (
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            <span className="font-medium text-foreground">Missing fields:</span> {contact.missingFields.join(", ")}
          </p>
        )}
        {contact.doNotContact && contact.doNotContactReason && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">Do not contact: {contact.doNotContactReason}</p>
        )}
        {canManage && (
          <div className="mt-3">
            <ContactCrmActions
              contactId={contact.id}
              doNotContact={contact.doNotContact}
              ownerUserId={contact.ownerUserId}
              assignedToUserId={contact.assignedToUserId}
              members={members}
            />
          </div>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-black/[.08] p-4 sm:grid-cols-2 dark:border-white/[.145]">
        <Field label="Full Name" value={contact.fullName} />
        <Field label="Company Name" value={contact.companyName} />
        <Field label="Company Website" value={contact.companyWebsite} />
        <Field label="Designation" value={contact.designation} />
        <Field label="Department" value={contact.department} />
        <Field label="Role Category" value={label(contact.roleCategory)} />
        <Field label="Seniority" value={label(contact.seniority)} />
        <Field label="Email" value={contact.email} />
        <Field label="Email Status" value={label(contact.emailStatus)} />
        <Field label="Phone Number" value={contact.phoneNumber} />
        <Field label="Mobile Number" value={contact.mobileNumber} />
        <Field label="LinkedIn URL" value={contact.linkedinUrl} />
        <Field label="Country" value={contact.country} />
        <Field label="Location" value={contact.location} />
        <Field label="Source URL" value={contact.sourceUrl} />
        <Field label="Source Type" value={label(contact.sourceType)} />
        <Field label="Last Contacted At" value={contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleString() : null} />
        <Field label="Tags" value={contact.tags.length > 0 ? contact.tags.join(", ") : null} />
      </dl>

      {contact.notes && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">{contact.notes}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium">Related records</h2>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          <li>
            Target Customer:{" "}
            {relatedCustomer ? (
              <Link href={`/dashboard/customers/${relatedCustomer.id}`} className="underline-offset-2 hover:underline">
                {relatedCustomer.customerName}
              </Link>
            ) : (
              "—"
            )}
          </li>
          <li>
            Project:{" "}
            {relatedProject ? (
              <Link href={`/dashboard/projects/${relatedProject.id}`} className="underline-offset-2 hover:underline">
                {relatedProject.projectName}
              </Link>
            ) : (
              "—"
            )}
          </li>
          <li>
            Tender Buyer:{" "}
            {relatedTenderBuyer ? (
              <Link href={`/dashboard/tender-buyers/${relatedTenderBuyer.id}`} className="underline-offset-2 hover:underline">
                {relatedTenderBuyer.customerName}
              </Link>
            ) : (
              "—"
            )}
          </li>
          <li>
            Live Tender:{" "}
            {relatedTenderOpportunity ? (
              <Link href={`/dashboard/live-tenders/${relatedTenderOpportunity.id}`} className="underline-offset-2 hover:underline">
                {relatedTenderOpportunity.tenderTitle}
              </Link>
            ) : (
              "—"
            )}
          </li>
          <li>
            Vendor Registration:{" "}
            {relatedVendorRegistration ? (
              <Link href={`/dashboard/vendor-registrations/${relatedVendorRegistration.id}`} className="underline-offset-2 hover:underline">
                {relatedVendorRegistration.customerName}
              </Link>
            ) : (
              "—"
            )}
          </li>
        </ul>
        {canManage && (
          <div className="mt-4">
            <ContactLinkForm contactId={contact.id} />
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium">Related opportunity recommendations</h2>
        <div className="mt-3">
          <ContactRecommendationsSection
            workspaceId={active.workspace.id}
            currentContactId={contact.id}
            relatedTargetCustomerId={contact.relatedTargetCustomerId}
            relatedProjectOpportunityId={contact.relatedProjectOpportunityId}
            relatedTenderBuyerId={contact.relatedTenderBuyerId}
            relatedTenderOpportunityId={contact.relatedTenderOpportunityId}
            relatedVendorRegistrationId={contact.relatedVendorRegistrationId}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium">Source history ({contact.sourceHistory.length})</h2>
        {contact.sourceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No sources recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {contact.sourceHistory.map((entry, index) => (
              <li key={index} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <div className="flex items-center justify-between">
                  <span>{label(entry.sourceType)}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">{new Date(entry.retrievedAt).toLocaleString()}</span>
                </div>
                {entry.url && (
                  <a href={entry.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs underline-offset-2 hover:underline">
                    {entry.url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Tasks</h2>
          <div className="mt-3">
            <ContactTasksSection contactId={contact.id} tasks={tasks} />
          </div>
        </div>
      )}

      {canManage && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Email draft generator</h2>
          <div className="mt-3">
            <ContactEmailDraftPanel
              contactId={contact.id}
              templates={templates.map((t) => ({ id: t.id, name: t.name, templateType: t.templateType }))}
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium">Activity timeline ({activities.length})</h2>
        {canManage && (
          <div className="mt-3">
            <ContactActivityForm contactId={contact.id} />
          </div>
        )}
        {activityGroups.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No activity logged yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {activityGroups.map((group) => (
              <div key={group.date}>
                <p className="text-xs font-medium text-black/50 dark:text-white/50">{group.date}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {group.activities.map((activity) => (
                    <li key={activity.id} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{ACTIVITY_TYPE_LABEL[activity.activityType] ?? activity.activityType}</Badge>
                        <span className="text-xs text-black/50 dark:text-white/50">{new Date(activity.activityDate).toLocaleTimeString()}</span>
                      </div>
                      {activity.title && <p className="mt-1 font-medium">{activity.title}</p>}
                      {activity.description && <p className="mt-1 text-black/70 dark:text-white/70">{activity.description}</p>}
                      {activity.outcome && <p className="mt-1 text-xs text-black/50 dark:text-white/50">Outcome: {label(activity.outcome)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
