import { Schema, models, model } from "mongoose";
import { idField, timestamps, CONTACT_RELATED_RECORD_TYPES } from "./shared";
import type { ContactRelatedRecordType } from "./shared";

export const CONTACT_DISCOVERY_TARGET_STATUSES = [
  "NEW",
  "QUEUED",
  "SEARCHING",
  "SEARCHED",
  "CONTACTS_FOUND",
  "NO_CONTACTS_FOUND",
  "FAILED",
  "ARCHIVED",
] as const;
export type ContactDiscoveryTargetStatus = (typeof CONTACT_DISCOVERY_TARGET_STATUSES)[number];

export const CONTACT_DISCOVERY_TARGET_PRIORITIES = ["A_PLUS", "A", "B", "C"] as const;
export type ContactDiscoveryTargetPriority = (typeof CONTACT_DISCOVERY_TARGET_PRIORITIES)[number];

/**
 * One company/opportunity worth searching for public contacts — generated
 * from an existing TargetCustomer/ProjectOpportunity/TenderBuyer/
 * TenderOpportunity/VendorRegistration record (or, in principle, a manually
 * entered company) by `src/lib/contact-discovery/targets.ts`. This is the
 * queue the contact search-query generator reads from; it doesn't hold
 * contacts itself (see `contactsFound`, a rollup count).
 */
const ContactDiscoveryTargetSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    relatedRecordType: { type: String, enum: CONTACT_RELATED_RECORD_TYPES, required: true, index: true },
    relatedRecordId: { type: String, required: true, index: true },
    companyName: { type: String, required: true, index: true },
    companyWebsite: { type: String },
    companyDomain: { type: String, index: true },
    country: { type: String, index: true },
    priority: { type: String, enum: CONTACT_DISCOVERY_TARGET_PRIORITIES, default: "C", index: true },
    status: { type: String, enum: CONTACT_DISCOVERY_TARGET_STATUSES, default: "NEW", index: true },
    lastQueuedAt: { type: Date },
    lastSearchedAt: { type: Date, index: true },
    contactsFound: { type: Number, default: 0 },
    /** Snapshot of the related record's own status at the time this target was last (re)generated — lets target generation re-prioritize without a second DB round-trip per record. */
    sourceEntityStatus: { type: String },
  },
  timestamps,
);
ContactDiscoveryTargetSchema.index({ workspaceId: 1, relatedRecordType: 1, relatedRecordId: 1 }, { unique: true });
ContactDiscoveryTargetSchema.index({ workspaceId: 1, createdAt: -1 });

export const ContactDiscoveryTarget = models.ContactDiscoveryTarget ?? model("ContactDiscoveryTarget", ContactDiscoveryTargetSchema);

export type ContactDiscoveryTarget = {
  id: string;
  workspaceId: string;
  relatedRecordType: ContactRelatedRecordType;
  relatedRecordId: string;
  companyName: string;
  companyWebsite: string | null;
  companyDomain: string | null;
  country: string | null;
  priority: ContactDiscoveryTargetPriority;
  status: ContactDiscoveryTargetStatus;
  lastQueuedAt: Date | null;
  lastSearchedAt: Date | null;
  contactsFound: number;
  sourceEntityStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const CONTACT_EXTRACTION_RUN_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type ContactExtractionRunStatus = (typeof CONTACT_EXTRACTION_RUN_STATUSES)[number];

/**
 * One invocation of the contact-results processor
 * (`src/lib/contact-discovery/processor.ts`) — the Contact-Discovery
 * counterpart to DiscoveryRun, but scoped to "turn CONTACT raw results into
 * Contact records" rather than "run search queries". Optionally tied back to
 * a single ContactDiscoveryTarget when the batch was scoped to one company;
 * null when it was a workspace-wide batch.
 */
const ContactExtractionRunSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    contactDiscoveryTargetId: { type: String, index: true },
    discoveryRunId: { type: String, index: true },
    status: { type: String, enum: CONTACT_EXTRACTION_RUN_STATUSES, default: "QUEUED", index: true },
    rawResultsProcessed: { type: Number, default: 0 },
    contactsExtracted: { type: Number, default: 0 },
    contactsCreated: { type: Number, default: 0 },
    contactsUpdated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    errorSummary: { type: String },
  },
  timestamps,
);
ContactExtractionRunSchema.index({ workspaceId: 1, createdAt: -1 });

export const ContactExtractionRun = models.ContactExtractionRun ?? model("ContactExtractionRun", ContactExtractionRunSchema);

export type ContactExtractionRun = {
  id: string;
  workspaceId: string;
  contactDiscoveryTargetId: string | null;
  discoveryRunId: string | null;
  status: ContactExtractionRunStatus;
  rawResultsProcessed: number;
  contactsExtracted: number;
  contactsCreated: number;
  contactsUpdated: number;
  skipped: number;
  failed: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};
