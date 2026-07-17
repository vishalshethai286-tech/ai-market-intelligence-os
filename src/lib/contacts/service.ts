import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  Contact as ContactModel,
  ContactActivity as ContactActivityModel,
  ContactTask as ContactTaskModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
} from "@/models";
import type {
  Contact,
  ContactActivity,
  ContactActivityType,
  ContactActivityOutcome,
  ContactStatus,
  ContactRoleCategory,
  ContactSeniority,
  ContactSourceType,
  ContactLinkableRecordType,
} from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import {
  splitFullName,
  normalizeCompanyDomain,
  inferRoleCategoryFromDesignation,
  inferSeniorityFromDesignation,
  buildContactDuplicateKey,
} from "./normalize";
import { detectExistingContact, updateExistingContactWithBetterData, preserveContactSourceHistory } from "./duplicate";
import { computeContactScore } from "./scoring";
import type { ContactScoringContext } from "./scoring";
import { computeEnrichmentFields } from "./enrichment";
import { DEFAULT_ACTIVITY_PAGE_SIZE } from "./constants";

export class ContactNotFoundError extends Error {}
export class RelatedRecordNotFoundError extends Error {}

/** Which related-record field + backing model each linkable recordType maps to — used by both scoring (isLinkedToApprovedRecord) and the link* functions below. */
const RELATED_RECORD_CONFIG = {
  TARGET_CUSTOMER: { field: "relatedTargetCustomerId", model: TargetCustomerModel, approvedStatuses: ["APPROVED"] },
  PROJECT_OPPORTUNITY: { field: "relatedProjectOpportunityId", model: ProjectOpportunityModel, approvedStatuses: ["APPROVED"] },
  TENDER_BUYER: { field: "relatedTenderBuyerId", model: TenderBuyerModel, approvedStatuses: ["APPROVED"] },
  TENDER_OPPORTUNITY: { field: "relatedTenderOpportunityId", model: TenderOpportunityModel, approvedStatuses: ["ELIGIBLE", "WON"] },
  VENDOR_REGISTRATION: { field: "relatedVendorRegistrationId", model: VendorRegistrationModel, approvedStatuses: ["APPROVED"] },
} as const;
export type RelatedRecordType = keyof typeof RELATED_RECORD_CONFIG;

async function buildScoringContext(workspaceId: string): Promise<ContactScoringContext> {
  const facts = await listBrainFacts(workspaceId);
  const targetCountries = facts.filter((f) => f.factType === "COUNTRY_SERVED").map((f) => f.factValue);
  return { targetCountries };
}

/** Whether any of this contact's related records is in an approved-ish status — resolved fresh each time since a related record's own status can change independently of the contact. */
async function resolveIsLinkedToApprovedRecord(workspaceId: string, contact: { get: (field: string) => unknown }): Promise<boolean> {
  const checks = await Promise.all(
    (Object.keys(RELATED_RECORD_CONFIG) as RelatedRecordType[]).map(async (recordType) => {
      const config = RELATED_RECORD_CONFIG[recordType];
      const relatedId = contact.get(config.field) as string | null;
      if (!relatedId) return false;
      const record = await config.model.findOne({ _id: relatedId, workspaceId }, { status: 1 });
      return Boolean(record && (config.approvedStatuses as readonly string[]).includes(record.status as string));
    }),
  );
  return checks.some(Boolean);
}

/** Recomputes and applies priorityScore/priority on a Contact document in place — caller is responsible for `.save()`. */
async function rescoreContact(workspaceId: string, doc: InstanceType<typeof ContactModel>): Promise<void> {
  const [context, isLinkedToApprovedRecord] = await Promise.all([buildScoringContext(workspaceId), resolveIsLinkedToApprovedRecord(workspaceId, doc)]);

  const breakdown = computeContactScore(
    {
      roleCategory: doc.roleCategory as ContactRoleCategory,
      seniority: doc.seniority as ContactSeniority,
      hasEmail: Boolean(doc.email),
      hasPhone: Boolean(doc.phoneNumber || doc.mobileNumber),
      hasLinkedIn: Boolean(doc.linkedinUrl),
      isLinkedToApprovedRecord,
      sourceType: doc.sourceType as ContactSourceType,
      country: (doc.country as string) ?? "",
      confidenceScore: (doc.confidenceScore as number) ?? 0,
    },
    context,
  );

  doc.priorityScore = breakdown.totalScore;
  doc.priority = breakdown.priority;
}

/** Recomputes and applies enrichmentScore/enrichmentStatus/missingFields/recommendedAction/recommendedActionReason/bestContactFor on a Contact document in place — caller is responsible for `.save()`. Never touches doNotContact/doNotContactReason/ownerUserId/assignedToUserId, which are user-set and must survive every enrichment refresh untouched. */
function applyEnrichment(doc: InstanceType<typeof ContactModel>): void {
  const fields = computeEnrichmentFields(doc.toObject());
  doc.enrichmentScore = fields.enrichmentScore;
  doc.enrichmentStatus = fields.enrichmentStatus;
  doc.missingFields = fields.missingFields;
  doc.recommendedAction = fields.recommendedAction;
  doc.recommendedActionReason = fields.recommendedActionReason;
  doc.bestContactFor = fields.bestContactFor;
}

export type CreateContactInput = {
  fullName: string;
  companyName?: string;
  companyWebsite?: string;
  designation?: string;
  department?: string;
  roleCategory?: ContactRoleCategory;
  seniority?: ContactSeniority;
  email?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  linkedinUrl?: string;
  country?: string;
  location?: string;
  status?: ContactStatus;
  notes?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceType?: ContactSourceType;
  confidenceScore?: number;
  ownerUserId?: string;
  assignedToUserId?: string;
};

export type CreateContactResult = { contact: Contact; outcome: "CREATED" | "UPDATED_EXISTING" };

/**
 * Creates a new Contact, or — if detectExistingContact finds a plausible
 * match — updates the existing one instead (filling empty fields, appending
 * source history) rather than creating a duplicate row. Infers
 * firstName/lastName, roleCategory, seniority, companyDomain, and
 * priorityScore/priority automatically; any explicitly-provided value for
 * those wins over the inference.
 */
export async function createContact(workspaceId: string, input: CreateContactInput): Promise<CreateContactResult> {
  await dbConnect();

  const { firstName, lastName } = splitFullName(input.fullName);
  const companyDomain = normalizeCompanyDomain(input.companyWebsite ?? "");
  const roleCategory = input.roleCategory ?? (input.designation ? inferRoleCategoryFromDesignation(input.designation) : "OTHER");
  const seniority = input.seniority ?? (input.designation ? inferSeniorityFromDesignation(input.designation) : "UNKNOWN");
  const sourceType = input.sourceType ?? "MANUAL_ENTRY";
  const sourceHistoryEntry = { url: input.sourceUrl ?? null, sourceType, note: null, retrievedAt: new Date() };

  const existingMatch = await detectExistingContact(workspaceId, {
    fullName: input.fullName,
    email: input.email ?? "",
    linkedinUrl: input.linkedinUrl ?? "",
    companyDomain,
    companyName: input.companyName ?? "",
    country: input.country ?? "",
    phoneNumber: input.phoneNumber ?? "",
  });

  if (existingMatch?.matchType === "STRONG") {
    const existingDoc = await ContactModel.findById(existingMatch.contact.id);
    if (existingDoc) {
      updateExistingContactWithBetterData(existingDoc, {
        firstName,
        lastName,
        companyName: input.companyName,
        companyWebsite: input.companyWebsite,
        companyDomain,
        designation: input.designation,
        department: input.department,
        email: input.email,
        phoneNumber: input.phoneNumber,
        mobileNumber: input.mobileNumber,
        linkedinUrl: input.linkedinUrl,
        country: input.country,
        location: input.location,
        notes: input.notes,
      });
      existingDoc.sourceHistory = preserveContactSourceHistory(existingDoc.sourceHistory, sourceHistoryEntry);
      existingDoc.lastVerifiedAt = new Date();
      await rescoreContact(workspaceId, existingDoc);
      applyEnrichment(existingDoc);
      await existingDoc.save();
      return { contact: existingDoc.toObject() as Contact, outcome: "UPDATED_EXISTING" };
    }
  }

  const created = await ContactModel.create({
    workspaceId,
    fullName: input.fullName,
    firstName,
    lastName,
    companyName: input.companyName || null,
    companyWebsite: input.companyWebsite || null,
    companyDomain: companyDomain || null,
    designation: input.designation || null,
    department: input.department || null,
    roleCategory,
    seniority,
    email: input.email || null,
    phoneNumber: input.phoneNumber || null,
    mobileNumber: input.mobileNumber || null,
    linkedinUrl: input.linkedinUrl || null,
    country: input.country || null,
    location: input.location || null,
    sourceUrl: input.sourceUrl || null,
    sourceType,
    sourceHistory: [sourceHistoryEntry],
    confidenceScore: input.confidenceScore ?? 0,
    status: input.status ?? "NEW",
    notes: input.notes || null,
    tags: input.tags ?? [],
    lastVerifiedAt: new Date(),
    duplicateStatus: existingMatch?.matchType === "WEAK" ? "POSSIBLE_DUPLICATE" : "UNIQUE",
    duplicateKey: buildContactDuplicateKey(workspaceId, input.fullName, input.email ?? "", input.linkedinUrl ?? "", companyDomain),
    ownerUserId: input.ownerUserId || null,
    assignedToUserId: input.assignedToUserId || null,
  });

  await rescoreContact(workspaceId, created);
  applyEnrichment(created);
  await created.save();

  return { contact: created.toObject() as Contact, outcome: "CREATED" };
}

export type UpdateContactInput = Partial<
  Pick<
    Contact,
    | "fullName"
    | "companyName"
    | "companyWebsite"
    | "designation"
    | "department"
    | "roleCategory"
    | "seniority"
    | "email"
    | "emailStatus"
    | "phoneNumber"
    | "mobileNumber"
    | "linkedinUrl"
    | "country"
    | "location"
    | "notes"
    | "tags"
    | "nextFollowUpAt"
    | "status"
    | "sourceUrl"
    | "sourceType"
    | "doNotContact"
    | "doNotContactReason"
    | "ownerUserId"
    | "assignedToUserId"
  >
>;

/** Updates editable fields on an existing Contact; re-infers roleCategory/seniority from a new designation unless the caller explicitly overrides them, re-derives companyDomain from a new companyWebsite, and always rescoring afterward since any of these fields can affect the priority score. */
export async function updateContact(workspaceId: string, id: string, input: UpdateContactInput): Promise<Contact> {
  await dbConnect();
  const doc = await ContactModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");

  if (input.fullName !== undefined) {
    doc.fullName = input.fullName;
    const { firstName, lastName } = splitFullName(input.fullName);
    doc.firstName = firstName;
    doc.lastName = lastName;
  }
  if (input.companyName !== undefined) doc.companyName = input.companyName;
  if (input.companyWebsite !== undefined) {
    doc.companyWebsite = input.companyWebsite;
    doc.companyDomain = normalizeCompanyDomain(input.companyWebsite ?? "") || null;
  }
  if (input.designation !== undefined) {
    doc.designation = input.designation;
    if (input.roleCategory === undefined) doc.roleCategory = inferRoleCategoryFromDesignation(input.designation ?? "");
    if (input.seniority === undefined) doc.seniority = inferSeniorityFromDesignation(input.designation ?? "");
  }
  if (input.roleCategory !== undefined) doc.roleCategory = input.roleCategory;
  if (input.seniority !== undefined) doc.seniority = input.seniority;
  if (input.department !== undefined) doc.department = input.department;
  if (input.email !== undefined) doc.email = input.email;
  if (input.emailStatus !== undefined) doc.emailStatus = input.emailStatus;
  if (input.phoneNumber !== undefined) doc.phoneNumber = input.phoneNumber;
  if (input.mobileNumber !== undefined) doc.mobileNumber = input.mobileNumber;
  if (input.linkedinUrl !== undefined) doc.linkedinUrl = input.linkedinUrl;
  if (input.country !== undefined) doc.country = input.country;
  if (input.location !== undefined) doc.location = input.location;
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.tags !== undefined) doc.tags = input.tags;
  if (input.nextFollowUpAt !== undefined) doc.nextFollowUpAt = input.nextFollowUpAt;
  if (input.status !== undefined) doc.status = input.status;
  if (input.sourceUrl !== undefined) doc.sourceUrl = input.sourceUrl;
  if (input.sourceType !== undefined) doc.sourceType = input.sourceType;
  if (input.doNotContact !== undefined) doc.doNotContact = input.doNotContact;
  if (input.doNotContactReason !== undefined) doc.doNotContactReason = input.doNotContactReason;
  if (input.ownerUserId !== undefined) doc.ownerUserId = input.ownerUserId;
  if (input.assignedToUserId !== undefined) doc.assignedToUserId = input.assignedToUserId;

  await rescoreContact(workspaceId, doc);
  applyEnrichment(doc);
  await doc.save();
  return doc.toObject() as Contact;
}

export async function getContactById(workspaceId: string, id: string): Promise<Contact> {
  await dbConnect();
  const doc = await ContactModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");
  return doc.toObject() as Contact;
}

/** contactId -> fullName lookup for a batch of ids — for the Contact Tasks page's task rows, which reference a contactId but want to display its name without a full Contact fetch. */
export async function getContactNamesByIds(workspaceId: string, contactIds: string[]): Promise<Record<string, string>> {
  await dbConnect();
  const uniqueIds = [...new Set(contactIds)];
  if (uniqueIds.length === 0) return {};
  const rows = await ContactModel.find({ workspaceId, _id: { $in: uniqueIds } }, { fullName: 1 });
  const names: Record<string, string> = {};
  for (const row of rows) names[row.id as string] = row.fullName as string;
  return names;
}

export type ContactFilters = {
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
  doNotContact?: boolean;
  assignedToUserId?: string;
  needsFollowUp?: boolean;
  overdueTasksOnly?: boolean;
  sortBy?: "priorityScore" | "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated Contacts for a workspace, for the Contacts page. */
export async function listContacts(workspaceId: string, filters: ContactFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.roleCategory) query.roleCategory = filters.roleCategory;
  if (filters.department) query.department = filters.department;
  if (filters.seniority) query.seniority = filters.seniority;
  if (filters.country) query.country = filters.country;
  if (filters.priority) query.priority = filters.priority;
  if (filters.status) query.status = filters.status;
  if (filters.sourceType) query.sourceType = filters.sourceType;
  if (filters.duplicateStatus) query.duplicateStatus = filters.duplicateStatus;
  if (filters.enrichmentStatus) query.enrichmentStatus = filters.enrichmentStatus;
  if (filters.recommendedAction) query.recommendedAction = filters.recommendedAction;
  if (filters.bestContactFor) query.bestContactFor = filters.bestContactFor;
  if (filters.doNotContact !== undefined) query.doNotContact = filters.doNotContact;
  if (filters.assignedToUserId) query.assignedToUserId = filters.assignedToUserId;
  if (filters.needsFollowUp) query.nextFollowUpAt = { $ne: null, $lte: new Date() };
  if (filters.overdueTasksOnly) {
    const overdueContactIds = await ContactTaskModel.find(
      { workspaceId, status: { $in: ["OPEN", "IN_PROGRESS"] }, dueDate: { $ne: null, $lt: new Date() }, contactId: { $ne: null } },
      { contactId: 1 },
    );
    query._id = { $in: overdueContactIds.map((t) => t.contactId as string) };
  }
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ fullName: regex }, { companyName: regex }, { email: regex }, { designation: regex }];
  }

  const [total, rows] = await Promise.all([
    ContactModel.countDocuments(query),
    ContactModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    contacts: rows.map((r) => r.toObject() as Contact),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Archives a contact rather than hard-deleting it — consistent with every other discovery record in this app, nothing is ever permanently removed so history/links stay intact. */
export async function deleteOrArchiveContact(workspaceId: string, id: string): Promise<Contact> {
  return changeContactStatus(workspaceId, id, "ARCHIVED");
}

export async function changeContactStatus(workspaceId: string, id: string, status: ContactStatus): Promise<Contact> {
  await dbConnect();
  const doc = await ContactModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");

  const previousStatus = doc.status;
  doc.status = status;
  applyEnrichment(doc);
  await doc.save();

  if (previousStatus !== status) {
    await ContactActivityModel.create({
      workspaceId,
      contactId: id,
      activityType: "STATUS_CHANGE",
      activityDate: new Date(),
      title: `Status changed to ${status}`,
      description: `Status changed from ${previousStatus} to ${status}.`,
    });
  }

  return doc.toObject() as Contact;
}

export type AddContactActivityInput = {
  activityType: ContactActivityType;
  activityDate?: Date;
  title?: string;
  description?: string;
  outcome?: ContactActivityOutcome;
  relatedRecordType?: ContactLinkableRecordType;
  relatedRecordId?: string;
  nextFollowUpAt?: Date | null;
  createdBy?: string;
};

/** Logs a CRM-style activity against a contact, and — for a Call/Email/Meeting/Follow Up — updates lastContactedAt (and nextFollowUpAt, if provided) on the contact itself. Re-runs enrichment afterward since a new nextFollowUpAt can change the recommended action (e.g. to FOLLOW_UP). */
export async function addContactActivity(workspaceId: string, contactId: string, input: AddContactActivityInput): Promise<ContactActivity> {
  await dbConnect();
  const contact = await ContactModel.findOne({ _id: contactId, workspaceId });
  if (!contact) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");

  const activityDate = input.activityDate ?? new Date();
  const activity = await ContactActivityModel.create({
    workspaceId,
    contactId,
    activityType: input.activityType,
    activityDate,
    title: input.title || null,
    description: input.description || null,
    outcome: input.outcome || null,
    relatedRecordType: input.relatedRecordType || null,
    relatedRecordId: input.relatedRecordId || null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
    createdBy: input.createdBy || null,
  });

  const CONTACT_TOUCH_ACTIVITY_TYPES: readonly ContactActivityType[] = ["CALL", "EMAIL", "MEETING", "FOLLOW_UP"];
  if (CONTACT_TOUCH_ACTIVITY_TYPES.includes(input.activityType)) {
    contact.lastContactedAt = activityDate;
  }
  if (input.nextFollowUpAt !== undefined) {
    contact.nextFollowUpAt = input.nextFollowUpAt;
  }
  applyEnrichment(contact);
  await contact.save();

  return activity.toObject() as ContactActivity;
}

/** Activity timeline for a contact, grouped by calendar day (newest day first, newest activity within a day first) — for the Contact detail page's timeline section. */
export function groupContactActivitiesByDate(activities: ContactActivity[]): { date: string; activities: ContactActivity[] }[] {
  const groups = new Map<string, ContactActivity[]>();
  for (const activity of activities) {
    const key = new Date(activity.activityDate).toDateString();
    const existing = groups.get(key);
    if (existing) existing.push(activity);
    else groups.set(key, [activity]);
  }
  return Array.from(groups.entries()).map(([date, groupActivities]) => ({ date, activities: groupActivities }));
}

/** Activity timeline for a contact, newest first, for the Contact detail page. */
export async function getContactActivities(workspaceId: string, contactId: string, limit = DEFAULT_ACTIVITY_PAGE_SIZE): Promise<ContactActivity[]> {
  await dbConnect();
  const rows = await ContactActivityModel.find({ workspaceId, contactId }).sort({ activityDate: -1 }).limit(limit);
  return rows.map((r) => r.toObject() as ContactActivity);
}

export type ContactDashboardStats = {
  total: number;
  newToday: number;
  aPlusCount: number;
  highPriorityCount: number;
  byRoleCategory: Record<string, number>;
  byCountry: { country: string; count: number }[];
  needingFollowUp: number;
  withoutEmail: number;
  withoutPhone: number;
  needingEnrichment: number;
  overdueContactTasks: number;
  linkedToTargetCustomers: number;
  linkedToProjects: number;
  linkedToTenderBuyers: number;
  linkedToTenderOpportunities: number;
  linkedToVendorRegistrations: number;
};

/** Aggregated counts for the dashboard's contact summary section. */
export async function getContactStats(workspaceId: string): Promise<ContactDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();

  const [
    total,
    newToday,
    aPlusCount,
    highPriorityCount,
    roleAgg,
    countryAgg,
    needingFollowUp,
    withoutEmail,
    withoutPhone,
    needingEnrichment,
    overdueContactTasks,
    linkedToTargetCustomers,
    linkedToProjects,
    linkedToTenderBuyers,
    linkedToTenderOpportunities,
    linkedToVendorRegistrations,
  ] = await Promise.all([
    ContactModel.countDocuments({ workspaceId }),
    ContactModel.countDocuments({ workspaceId, createdAt: { $gte: startOfToday } }),
    ContactModel.countDocuments({ workspaceId, priority: "A_PLUS" }),
    ContactModel.countDocuments({ workspaceId, priority: { $in: ["A_PLUS", "A"] } }),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$roleCategory", count: { $sum: 1 } } }]),
    ContactModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    ContactModel.countDocuments({ workspaceId, nextFollowUpAt: { $ne: null, $lte: now } }),
    ContactModel.countDocuments({ workspaceId, $or: [{ email: null }, { email: "" }] }),
    ContactModel.countDocuments({ workspaceId, $and: [{ $or: [{ phoneNumber: null }, { phoneNumber: "" }] }, { $or: [{ mobileNumber: null }, { mobileNumber: "" }] }] }),
    ContactModel.countDocuments({ workspaceId, enrichmentStatus: { $nin: ["COMPLETE", "DO_NOT_CONTACT", "ARCHIVED"] } }),
    ContactTaskModel.countDocuments({ workspaceId, status: { $in: ["OPEN", "IN_PROGRESS"] }, dueDate: { $ne: null, $lt: now } }),
    ContactModel.countDocuments({ workspaceId, relatedTargetCustomerId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedProjectOpportunityId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedTenderBuyerId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedTenderOpportunityId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedVendorRegistrationId: { $ne: null } }),
  ]);

  const byRoleCategory: Record<string, number> = {};
  for (const row of roleAgg as { _id: string | null; count: number }[]) {
    byRoleCategory[row._id ?? "OTHER"] = row.count;
  }

  return {
    total,
    newToday,
    aPlusCount,
    highPriorityCount,
    byRoleCategory,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    needingFollowUp,
    withoutEmail,
    withoutPhone,
    needingEnrichment,
    overdueContactTasks,
    linkedToTargetCustomers,
    linkedToProjects,
    linkedToTenderBuyers,
    linkedToTenderOpportunities,
    linkedToVendorRegistrations,
  };
}

async function linkContactToRelatedRecord(workspaceId: string, contactId: string, recordType: RelatedRecordType, recordId: string): Promise<Contact> {
  await dbConnect();
  const config = RELATED_RECORD_CONFIG[recordType];

  const [contact, record] = await Promise.all([
    ContactModel.findOne({ _id: contactId, workspaceId }),
    config.model.findOne({ _id: recordId, workspaceId }),
  ]);
  if (!contact) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");
  if (!record) throw new RelatedRecordNotFoundError("That record doesn't exist in this workspace.");

  contact.set(config.field, recordId);
  await rescoreContact(workspaceId, contact);
  applyEnrichment(contact);
  await contact.save();
  return contact.toObject() as Contact;
}

export async function linkContactToTargetCustomer(workspaceId: string, contactId: string, targetCustomerId: string): Promise<Contact> {
  return linkContactToRelatedRecord(workspaceId, contactId, "TARGET_CUSTOMER", targetCustomerId);
}

export async function linkContactToProject(workspaceId: string, contactId: string, projectOpportunityId: string): Promise<Contact> {
  return linkContactToRelatedRecord(workspaceId, contactId, "PROJECT_OPPORTUNITY", projectOpportunityId);
}

export async function linkContactToTenderBuyer(workspaceId: string, contactId: string, tenderBuyerId: string): Promise<Contact> {
  return linkContactToRelatedRecord(workspaceId, contactId, "TENDER_BUYER", tenderBuyerId);
}

export async function linkContactToTenderOpportunity(workspaceId: string, contactId: string, tenderOpportunityId: string): Promise<Contact> {
  return linkContactToRelatedRecord(workspaceId, contactId, "TENDER_OPPORTUNITY", tenderOpportunityId);
}

export async function linkContactToVendorRegistration(workspaceId: string, contactId: string, vendorRegistrationId: string): Promise<Contact> {
  return linkContactToRelatedRecord(workspaceId, contactId, "VENDOR_REGISTRATION", vendorRegistrationId);
}

/** Contacts linked to a given related record — for the "Related Contacts" section on Customer/Project/Tender Buyer/Live Tender/Vendor Registration detail pages. */
export async function listContactsForRelatedRecord(workspaceId: string, recordType: RelatedRecordType, recordId: string): Promise<Contact[]> {
  await dbConnect();
  const field = RELATED_RECORD_CONFIG[recordType].field;
  const rows = await ContactModel.find({ workspaceId, [field]: recordId }).sort({ priorityScore: -1, createdAt: -1 });
  return rows.map((r) => r.toObject() as Contact);
}
