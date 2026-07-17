import { Schema, models, model } from "mongoose";
import { idField, timestamps, CONTACT_LINKABLE_RECORD_TYPES } from "./shared";
import type { ContactLinkableRecordType } from "./shared";

export const CONTACT_TASK_TYPES = [
  "CALL",
  "EMAIL",
  "FOLLOW_UP",
  "VERIFY",
  "FIND_EMAIL",
  "FIND_PHONE",
  "LINK_OPPORTUNITY",
  "REVIEW",
  "OTHER",
] as const;
export type ContactTaskType = (typeof CONTACT_TASK_TYPES)[number];

/** OVERDUE is a valid stored value for completeness/manual use, but the app itself never sets it — "overdue" is always computed on read as status in (OPEN, IN_PROGRESS) with a past dueDate (see src/lib/contacts/tasks.ts), so a task's persisted status only ever needs to flip to COMPLETED/CANCELLED via user action. */
export const CONTACT_TASK_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"] as const;
export type ContactTaskStatus = (typeof CONTACT_TASK_STATUSES)[number];

export const CONTACT_TASK_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type ContactTaskPriority = (typeof CONTACT_TASK_PRIORITIES)[number];

/**
 * A follow-up/CRM action item — usually against one Contact ("Call this
 * person", "Find an email for this contact", "Follow up next week"), but
 * `contactId` is optional so a task can also exist for an entity that has
 * NO contact yet at all ("Find a procurement contact for ABC Pumps",
 * pointing only at relatedRecordType/relatedRecordId). Purely an in-app
 * to-do list: nothing here sends a reminder, email, or notification outside
 * the app (see src/lib/contacts/tasks.ts's module docblock).
 */
const ContactTaskSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    contactId: { type: String, index: true },
    relatedRecordType: { type: String, enum: CONTACT_LINKABLE_RECORD_TYPES },
    relatedRecordId: { type: String },
    title: { type: String, required: true },
    description: { type: String },
    taskType: { type: String, enum: CONTACT_TASK_TYPES, required: true, index: true },
    status: { type: String, enum: CONTACT_TASK_STATUSES, default: "OPEN", index: true },
    priority: { type: String, enum: CONTACT_TASK_PRIORITIES, default: "MEDIUM", index: true },
    dueDate: { type: Date, index: true },
    completedAt: { type: Date },
    assignedToUserId: { type: String, index: true },
    createdBy: { type: String },
  },
  timestamps,
);
ContactTaskSchema.index({ workspaceId: 1, contactId: 1, createdAt: -1 });
ContactTaskSchema.index({ workspaceId: 1, status: 1, dueDate: 1 });
ContactTaskSchema.index({ workspaceId: 1, assignedToUserId: 1, status: 1 });

export const ContactTask = models.ContactTask ?? model("ContactTask", ContactTaskSchema);

export type ContactTask = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  relatedRecordType: ContactLinkableRecordType | null;
  relatedRecordId: string | null;
  title: string;
  description: string | null;
  taskType: ContactTaskType;
  status: ContactTaskStatus;
  priority: ContactTaskPriority;
  dueDate: Date | null;
  completedAt: Date | null;
  assignedToUserId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};
