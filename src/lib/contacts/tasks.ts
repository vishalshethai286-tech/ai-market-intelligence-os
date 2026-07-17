import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  ContactTask as ContactTaskModel,
  Contact as ContactModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
} from "@/models";
import type { ContactTask, ContactTaskType, ContactTaskStatus, ContactTaskPriority, ContactLinkableRecordType, ContactRecommendedAction } from "@/models";

/**
 * Purely an in-app to-do list for the contact/CRM workflow — nothing in
 * this module sends an email, SMS, push notification, or calendar invite.
 * A task is only ever visible inside this app; "overdue" is computed on
 * read (status OPEN/IN_PROGRESS with a past dueDate), not pushed anywhere.
 */
export class ContactTaskNotFoundError extends Error {}

export type CreateContactTaskInput = {
  contactId?: string;
  relatedRecordType?: ContactLinkableRecordType;
  relatedRecordId?: string;
  title: string;
  description?: string;
  taskType: ContactTaskType;
  priority?: ContactTaskPriority;
  dueDate?: Date;
  assignedToUserId?: string;
  createdBy?: string;
};

export async function createContactTask(workspaceId: string, input: CreateContactTaskInput): Promise<ContactTask> {
  await dbConnect();

  if (input.contactId) {
    const contact = await ContactModel.findOne({ _id: input.contactId, workspaceId }, { _id: 1 });
    if (!contact) throw new ContactTaskNotFoundError("That contact doesn't exist in this workspace.");
  }

  const created = await ContactTaskModel.create({
    workspaceId,
    contactId: input.contactId || null,
    relatedRecordType: input.relatedRecordType || null,
    relatedRecordId: input.relatedRecordId || null,
    title: input.title,
    description: input.description || null,
    taskType: input.taskType,
    priority: input.priority ?? "MEDIUM",
    dueDate: input.dueDate ?? null,
    assignedToUserId: input.assignedToUserId || null,
    createdBy: input.createdBy || null,
  });

  return created.toObject() as ContactTask;
}

export type UpdateContactTaskInput = Partial<{
  title: string;
  description: string;
  taskType: ContactTaskType;
  status: ContactTaskStatus;
  priority: ContactTaskPriority;
  dueDate: Date | null;
  assignedToUserId: string | null;
}>;

export async function updateContactTask(workspaceId: string, taskId: string, input: UpdateContactTaskInput): Promise<ContactTask> {
  await dbConnect();
  const doc = await ContactTaskModel.findOne({ _id: taskId, workspaceId });
  if (!doc) throw new ContactTaskNotFoundError("That task doesn't exist in this workspace.");

  if (input.title !== undefined) doc.title = input.title;
  if (input.description !== undefined) doc.description = input.description;
  if (input.taskType !== undefined) doc.taskType = input.taskType;
  if (input.priority !== undefined) doc.priority = input.priority;
  if (input.dueDate !== undefined) doc.dueDate = input.dueDate;
  if (input.assignedToUserId !== undefined) doc.assignedToUserId = input.assignedToUserId;
  if (input.status !== undefined) {
    doc.status = input.status;
    if (input.status === "COMPLETED" && !doc.completedAt) doc.completedAt = new Date();
    if (input.status !== "COMPLETED") doc.completedAt = null;
  }

  await doc.save();
  return doc.toObject() as ContactTask;
}

export async function completeContactTask(workspaceId: string, taskId: string): Promise<ContactTask> {
  return updateContactTask(workspaceId, taskId, { status: "COMPLETED" });
}

function withComputedOverdue(task: ContactTask): ContactTask & { isOverdue: boolean } {
  const isOverdue = (task.status === "OPEN" || task.status === "IN_PROGRESS") && Boolean(task.dueDate) && new Date(task.dueDate as Date) < new Date();
  return { ...task, isOverdue };
}

export type ContactTaskFilters = {
  contactId?: string;
  taskType?: string;
  status?: string;
  priority?: string;
  relatedRecordType?: string;
  assignedToUserId?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
};

/** Search/filter/paginated ContactTasks for a workspace, for the Contact Tasks page. Each row gets a computed `isOverdue` flag (OPEN/IN_PROGRESS + past dueDate) rather than relying on a stored status. */
export async function listContactTasks(workspaceId: string, filters: ContactTaskFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));

  const query: Record<string, unknown> = { workspaceId };
  if (filters.contactId) query.contactId = filters.contactId;
  if (filters.taskType) query.taskType = filters.taskType;
  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.relatedRecordType) query.relatedRecordType = filters.relatedRecordType;
  if (filters.assignedToUserId) query.assignedToUserId = filters.assignedToUserId;
  if (filters.overdueOnly) {
    query.status = { $in: ["OPEN", "IN_PROGRESS"] };
    query.dueDate = { $ne: null, $lt: new Date() };
  }

  const [total, rows] = await Promise.all([
    ContactTaskModel.countDocuments(query),
    ContactTaskModel.find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    tasks: rows.map((r) => withComputedOverdue(r.toObject() as ContactTask)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Open/in-progress task counts per contact — for the Contacts list page's "Open Tasks" column. Returns a plain object (not a Map) so it round-trips cleanly through a Server Component. */
export async function countOpenContactTasksByContactIds(workspaceId: string, contactIds: string[]): Promise<Record<string, number>> {
  await dbConnect();
  if (contactIds.length === 0) return {};
  const rows = await ContactTaskModel.aggregate([
    { $match: { workspaceId, contactId: { $in: contactIds }, status: { $in: ["OPEN", "IN_PROGRESS"] } } },
    { $group: { _id: "$contactId", count: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {};
  for (const row of rows as { _id: string; count: number }[]) counts[row._id] = row.count;
  return counts;
}

/** Shorthand for "my open/in-progress tasks", sorted soonest-due-first — for the Contact Tasks page's "My open tasks" section. */
export async function listMyContactTasks(workspaceId: string, userId: string) {
  await dbConnect();
  const rows = await ContactTaskModel.find({ workspaceId, assignedToUserId: userId, status: { $in: ["OPEN", "IN_PROGRESS"] } }).sort({ dueDate: 1, createdAt: -1 });
  return rows.map((r) => withComputedOverdue(r.toObject() as ContactTask));
}

/** OPEN/IN_PROGRESS tasks whose dueDate has already passed — for the dashboard's "overdue contact tasks" metric and the Contact Tasks page's "Overdue" section. */
export async function getOverdueContactTasks(workspaceId: string) {
  await dbConnect();
  const rows = await ContactTaskModel.find({ workspaceId, status: { $in: ["OPEN", "IN_PROGRESS"] }, dueDate: { $ne: null, $lt: new Date() } }).sort({ dueDate: 1 });
  return rows.map((r) => withComputedOverdue(r.toObject() as ContactTask));
}

/** taskType/title/priority to use for each actionable recommendedAction — ADD_LINKEDIN/REVIEW/NONE/DO_NOT_CONTACT are deliberately excluded (either too low-value to nag about, or nothing should happen). */
const TASK_TEMPLATE_BY_ACTION: Partial<Record<ContactRecommendedAction, { taskType: ContactTaskType; title: (name: string) => string; priority: ContactTaskPriority }>> = {
  FIND_EMAIL: { taskType: "FIND_EMAIL", title: (name) => `Find email for ${name}`, priority: "MEDIUM" },
  FIND_PHONE: { taskType: "FIND_PHONE", title: (name) => `Find phone number for ${name}`, priority: "LOW" },
  VERIFY_CONTACT: { taskType: "VERIFY", title: (name) => `Verify contact details for ${name}`, priority: "MEDIUM" },
  CALL: { taskType: "CALL", title: (name) => `Call ${name}`, priority: "HIGH" },
  EMAIL_DRAFT: { taskType: "EMAIL", title: (name) => `Email ${name}`, priority: "HIGH" },
  FOLLOW_UP: { taskType: "FOLLOW_UP", title: (name) => `Follow up with ${name}`, priority: "HIGH" },
  LINK_TO_OPPORTUNITY: { taskType: "LINK_OPPORTUNITY", title: (name) => `Link ${name} to an opportunity`, priority: "LOW" },
};

/** Creates (at most) one recommended follow-up task for a single contact, based on its already-computed recommendedAction — skips silently if the action isn't actionable (NONE/DO_NOT_CONTACT/ADD_LINKEDIN/REVIEW) or if an open task of the same type already exists for this contact (never spams duplicates). Returns the created task, or null if nothing was created. */
export async function generateRecommendedContactTasks(workspaceId: string, contactId: string): Promise<ContactTask | null> {
  await dbConnect();
  const contact = await ContactModel.findOne({ _id: contactId, workspaceId });
  if (!contact) throw new ContactTaskNotFoundError("That contact doesn't exist in this workspace.");

  const template = TASK_TEMPLATE_BY_ACTION[contact.recommendedAction as ContactRecommendedAction];
  if (!template) return null;

  const existingOpen = await ContactTaskModel.findOne({
    workspaceId,
    contactId,
    taskType: template.taskType,
    status: { $in: ["OPEN", "IN_PROGRESS"] },
  });
  if (existingOpen) return null;

  const created = await ContactTaskModel.create({
    workspaceId,
    contactId,
    title: template.title(contact.fullName as string),
    description: (contact.recommendedActionReason as string) || null,
    taskType: template.taskType,
    priority: template.priority,
    dueDate: contact.nextFollowUpAt ?? null,
  });

  return created.toObject() as ContactTask;
}

/** One "needs a contact at all" source entity config — used by generateMissingContactTasksForWorkspace's entity-level sweep. */
type MissingContactEntityConfig = {
  recordType: ContactLinkableRecordType;
  model: typeof TargetCustomerModel;
  nameField: string;
  relatedField: string;
  statuses: string[];
  label: string;
};

const MISSING_CONTACT_ENTITY_CONFIGS: MissingContactEntityConfig[] = [
  { recordType: "TARGET_CUSTOMER", model: TargetCustomerModel, nameField: "customerName", relatedField: "relatedTargetCustomerId", statuses: ["NEW", "REVIEWED", "APPROVED", "CONTACTED"], label: "customer" },
  { recordType: "PROJECT_OPPORTUNITY", model: ProjectOpportunityModel, nameField: "clientName", relatedField: "relatedProjectOpportunityId", statuses: ["NEW", "REVIEWED", "APPROVED", "WATCHING", "CONTACTED"], label: "project" },
  { recordType: "TENDER_BUYER", model: TenderBuyerModel, nameField: "customerName", relatedField: "relatedTenderBuyerId", statuses: ["APPROVED", "WATCHING", "CONTACTED"], label: "tender buyer" },
  { recordType: "TENDER_OPPORTUNITY", model: TenderOpportunityModel, nameField: "buyerOrganization", relatedField: "relatedTenderOpportunityId", statuses: ["ELIGIBLE", "SUBMITTED"], label: "tender" },
  { recordType: "VENDOR_REGISTRATION", model: VendorRegistrationModel, nameField: "customerName", relatedField: "relatedVendorRegistrationId", statuses: ["SUBMITTED", "IN_PROGRESS", "APPROVED"], label: "vendor registration" },
];

/** Caps how many entity-level "find a contact" tasks one sweep creates, and how many contacts are scanned for per-contact recommended tasks — keeps a single call bounded regardless of workspace size. */
const MAX_TASKS_PER_SWEEP = 50;
const MAX_CONTACTS_SCANNED = 300;

export type GenerateMissingContactTasksSummary = {
  perContactTasksCreated: number;
  entityLevelTasksCreated: number;
};

/**
 * Workspace-wide recommended-task sweep — two sources:
 * 1. Every contact with an actionable recommendedAction gets (at most) one
 *    recommended task, via the same logic as generateRecommendedContactTasks.
 * 2. Every high-priority/active TargetCustomer/ProjectOpportunity/
 *    TenderBuyer/TenderOpportunity/VendorRegistration with NO linked
 *    contact at all gets a "Find a contact for X" task (contactId null,
 *    relatedRecordType/relatedRecordId set instead).
 * Never creates a duplicate open task for the same contact+taskType or
 * entity+taskType pair.
 */
export async function generateMissingContactTasksForWorkspace(workspaceId: string): Promise<GenerateMissingContactTasksSummary> {
  await dbConnect();

  let perContactTasksCreated = 0;
  const contacts = await ContactModel.find(
    { workspaceId, doNotContact: false, status: { $nin: ["ARCHIVED", "REJECTED", "NOT_RELEVANT"] }, recommendedAction: { $in: Object.keys(TASK_TEMPLATE_BY_ACTION) } },
    { _id: 1 },
  ).limit(MAX_CONTACTS_SCANNED);

  for (const contact of contacts) {
    if (perContactTasksCreated >= MAX_TASKS_PER_SWEEP) break;
    const created = await generateRecommendedContactTasks(workspaceId, contact.id as string);
    if (created) perContactTasksCreated += 1;
  }

  let entityLevelTasksCreated = 0;
  for (const config of MISSING_CONTACT_ENTITY_CONFIGS) {
    if (entityLevelTasksCreated >= MAX_TASKS_PER_SWEEP) break;

    const records = await config.model.find({ workspaceId, status: { $in: config.statuses } });
    if (records.length === 0) continue;

    const linkedIds = new Set((await ContactModel.find({ workspaceId, [config.relatedField]: { $ne: null } }, { [config.relatedField]: 1 })).map((c) => c.get(config.relatedField) as string));

    for (const record of records) {
      if (entityLevelTasksCreated >= MAX_TASKS_PER_SWEEP) break;
      if (linkedIds.has(record.id as string)) continue;

      const existingOpen = await ContactTaskModel.findOne({
        workspaceId,
        relatedRecordType: config.recordType,
        relatedRecordId: record.id,
        taskType: "FIND_EMAIL",
        status: { $in: ["OPEN", "IN_PROGRESS"] },
      });
      if (existingOpen) continue;

      await ContactTaskModel.create({
        workspaceId,
        relatedRecordType: config.recordType,
        relatedRecordId: record.id,
        title: `Find a contact for ${record.get(config.nameField) as string} (${config.label})`,
        taskType: "FIND_EMAIL",
        priority: "MEDIUM",
      });
      entityLevelTasksCreated += 1;
    }
  }

  return { perContactTasksCreated, entityLevelTasksCreated };
}
