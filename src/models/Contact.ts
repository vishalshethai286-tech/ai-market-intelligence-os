import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly, CONTACT_LINKABLE_RECORD_TYPES } from "./shared";
import type { ContactLinkableRecordType } from "./shared";

export const CONTACT_ROLE_CATEGORIES = [
  "PROCUREMENT",
  "PURCHASE",
  "SOURCING",
  "SUPPLY_CHAIN",
  "VENDOR_MANAGEMENT",
  "PROJECT_MANAGEMENT",
  "ENGINEERING",
  "MAINTENANCE",
  "PLANT_OPERATIONS",
  "OPERATIONS",
  "COMMERCIAL",
  "CONTRACTS",
  "TENDERING",
  "QUALITY",
  "TECHNICAL",
  "MANAGEMENT",
  "FINANCE",
  "ADMINISTRATION",
  "OTHER",
] as const;
export type ContactRoleCategory = (typeof CONTACT_ROLE_CATEGORIES)[number];

export const CONTACT_SENIORITIES = [
  "OWNER",
  "PRESIDENT",
  "CEO",
  "DIRECTOR",
  "VP",
  "HEAD",
  "MANAGER",
  "ENGINEER",
  "EXECUTIVE",
  "OFFICER",
  "COORDINATOR",
  "UNKNOWN",
] as const;
export type ContactSeniority = (typeof CONTACT_SENIORITIES)[number];

export const CONTACT_EMAIL_STATUSES = ["UNKNOWN", "FOUND", "VERIFIED", "UNVERIFIED", "INVALID", "BOUNCED", "NOT_AVAILABLE"] as const;
export type ContactEmailStatus = (typeof CONTACT_EMAIL_STATUSES)[number];

export const CONTACT_STATUSES = [
  "NEW",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
  "CONTACTED",
  "RESPONDED",
  "FOLLOW_UP",
  "NOT_RELEVANT",
  "ARCHIVED",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_PRIORITIES = ["A_PLUS", "A", "B", "C"] as const;
export type ContactPriority = (typeof CONTACT_PRIORITIES)[number];

export const CONTACT_DUPLICATE_STATUSES = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"] as const;
export type ContactDuplicateStatus = (typeof CONTACT_DUPLICATE_STATUSES)[number];

export const CONTACT_ENRICHMENT_STATUSES = [
  "COMPLETE",
  "NEEDS_EMAIL",
  "NEEDS_PHONE",
  "NEEDS_ROLE",
  "NEEDS_VERIFICATION",
  "NEEDS_LINKEDIN",
  "NEEDS_COMPANY_LINK",
  "LOW_CONFIDENCE",
  "DO_NOT_CONTACT",
  "ARCHIVED",
] as const;
export type ContactEnrichmentStatus = (typeof CONTACT_ENRICHMENT_STATUSES)[number];

export const CONTACT_RECOMMENDED_ACTIONS = [
  "CALL",
  "EMAIL_DRAFT",
  "FIND_EMAIL",
  "FIND_PHONE",
  "VERIFY_CONTACT",
  "ADD_LINKEDIN",
  "LINK_TO_OPPORTUNITY",
  "FOLLOW_UP",
  "REVIEW",
  "DO_NOT_CONTACT",
  "NONE",
] as const;
export type ContactRecommendedAction = (typeof CONTACT_RECOMMENDED_ACTIONS)[number];

export const CONTACT_BEST_CONTACT_FOR_VALUES = [
  "CUSTOMER_OUTREACH",
  "PROJECT_OPPORTUNITY",
  "TENDER_OPPORTUNITY",
  "VENDOR_REGISTRATION",
  "PROCUREMENT_CONTACT",
  "TECHNICAL_CONTACT",
  "MANAGEMENT_CONTACT",
  "GENERAL_CONTACT",
] as const;
export type ContactBestContactFor = (typeof CONTACT_BEST_CONTACT_FOR_VALUES)[number];

export const CONTACT_SOURCE_TYPES = [
  "COMPANY_WEBSITE",
  "CONTACT_PAGE",
  "TEAM_PAGE",
  "PROCUREMENT_PAGE",
  "SUPPLIER_PORTAL",
  "TENDER_DOCUMENT",
  "PUBLIC_PDF",
  "PUBLIC_DIRECTORY",
  "PRESS_RELEASE",
  "CONFERENCE_PAGE",
  "MANUAL_ENTRY",
  "CSV_IMPORT",
  "OTHER",
] as const;
export type ContactSourceType = (typeof CONTACT_SOURCE_TYPES)[number];

/** One entry per time this contact's information was (re)confirmed or sourced from somewhere — manual entries get a single MANUAL_ENTRY-sourced row; a future extraction pipeline can append more without a schema change. */
const ContactSourceHistoryEntrySchema = new Schema(
  {
    url: { type: String },
    sourceType: { type: String, enum: CONTACT_SOURCE_TYPES, required: true },
    note: { type: String },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A person — procurement/purchase/sourcing/supply-chain/vendor-management/
 * project/engineering/operations/commercial/contracts/management contact —
 * connected to a discovered company and/or opportunity. This phase
 * (11.5A) is manual entry + linking only: no extraction pipeline creates
 * these yet, unlike TargetCustomer/ProjectOpportunity/TenderBuyer/
 * TenderOpportunity/VendorRegistration, which are all RawSearchResult-derived.
 * The `related*Id` fields are loose string references (this codebase's
 * standard pattern — no Mongoose refs/populate), any of which may be set;
 * none are required, since a contact can also stand alone.
 */
const ContactSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    fullName: { type: String, required: true, index: true },
    firstName: { type: String },
    lastName: { type: String },
    companyName: { type: String, index: true },
    companyWebsite: { type: String },
    companyDomain: { type: String, index: true },
    designation: { type: String },
    department: { type: String, index: true },
    roleCategory: { type: String, enum: CONTACT_ROLE_CATEGORIES, default: "OTHER", index: true },
    seniority: { type: String, enum: CONTACT_SENIORITIES, default: "UNKNOWN" },
    email: { type: String, index: true },
    emailStatus: { type: String, enum: CONTACT_EMAIL_STATUSES, default: "UNKNOWN" },
    phoneNumber: { type: String, index: true },
    mobileNumber: { type: String },
    linkedinUrl: { type: String, index: true },
    country: { type: String, index: true },
    location: { type: String },
    sourceUrl: { type: String },
    sourceType: { type: String, enum: CONTACT_SOURCE_TYPES, default: "MANUAL_ENTRY" },
    sourceHistory: { type: [ContactSourceHistoryEntrySchema], default: [] },
    confidenceScore: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 },
    priority: { type: String, enum: CONTACT_PRIORITIES },
    status: { type: String, enum: CONTACT_STATUSES, default: "NEW", index: true },
    notes: { type: String },
    tags: { type: [String], default: [] },
    lastVerifiedAt: { type: Date, index: true },
    lastContactedAt: { type: Date },
    nextFollowUpAt: { type: Date, index: true },
    duplicateStatus: { type: String, enum: CONTACT_DUPLICATE_STATUSES, default: "UNIQUE", index: true },
    duplicateKey: { type: String, index: true },
    relatedTargetCustomerId: { type: String, index: true },
    relatedProjectOpportunityId: { type: String, index: true },
    relatedTenderBuyerId: { type: String, index: true },
    relatedTenderOpportunityId: { type: String, index: true },
    relatedVendorRegistrationId: { type: String, index: true },
    /** Phase 11.5C: contact-enrichment/CRM-workflow fields — always recomputed by src/lib/contacts/enrichment.ts on create/update, never hand-edited directly (except doNotContact/doNotContactReason and owner/assignedTo, which are the only ones a user sets and enrichment refresh must preserve). */
    enrichmentStatus: { type: String, enum: CONTACT_ENRICHMENT_STATUSES, default: "NEEDS_VERIFICATION", index: true },
    enrichmentScore: { type: Number, default: 0 },
    missingFields: { type: [String], default: [] },
    recommendedAction: { type: String, enum: CONTACT_RECOMMENDED_ACTIONS, default: "NONE", index: true },
    recommendedActionReason: { type: String },
    bestContactFor: { type: String, enum: CONTACT_BEST_CONTACT_FOR_VALUES },
    doNotContact: { type: Boolean, default: false, index: true },
    doNotContactReason: { type: String },
    ownerUserId: { type: String, index: true },
    assignedToUserId: { type: String, index: true },
  },
  timestamps,
);
ContactSchema.index({ workspaceId: 1, createdAt: -1 });
ContactSchema.index({ workspaceId: 1, updatedAt: -1 });
ContactSchema.index({ workspaceId: 1, priority: 1 });
ContactSchema.index({ workspaceId: 1, duplicateKey: 1 });
ContactSchema.index({ workspaceId: 1, enrichmentStatus: 1 });
ContactSchema.index({ workspaceId: 1, recommendedAction: 1 });

export const Contact = models.Contact ?? model("Contact", ContactSchema);

export type ContactSourceHistoryEntry = {
  url: string | null;
  sourceType: ContactSourceType;
  note: string | null;
  retrievedAt: Date;
};

export type Contact = {
  id: string;
  workspaceId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  companyDomain: string | null;
  designation: string | null;
  department: string | null;
  roleCategory: ContactRoleCategory;
  seniority: ContactSeniority;
  email: string | null;
  emailStatus: ContactEmailStatus;
  phoneNumber: string | null;
  mobileNumber: string | null;
  linkedinUrl: string | null;
  country: string | null;
  location: string | null;
  sourceUrl: string | null;
  sourceType: ContactSourceType;
  sourceHistory: ContactSourceHistoryEntry[];
  confidenceScore: number;
  priorityScore: number;
  priority: ContactPriority | null;
  status: ContactStatus;
  notes: string | null;
  tags: string[];
  lastVerifiedAt: Date | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  duplicateStatus: ContactDuplicateStatus;
  duplicateKey: string | null;
  relatedTargetCustomerId: string | null;
  relatedProjectOpportunityId: string | null;
  relatedTenderBuyerId: string | null;
  relatedTenderOpportunityId: string | null;
  relatedVendorRegistrationId: string | null;
  enrichmentStatus: ContactEnrichmentStatus;
  enrichmentScore: number;
  missingFields: string[];
  recommendedAction: ContactRecommendedAction;
  recommendedActionReason: string | null;
  bestContactFor: ContactBestContactFor | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
  ownerUserId: string | null;
  assignedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const CONTACT_ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "FOLLOW_UP",
  "STATUS_CHANGE",
  "VERIFICATION",
  "MANUAL_UPDATE",
  "OTHER",
] as const;
export type ContactActivityType = (typeof CONTACT_ACTIVITY_TYPES)[number];

/** Outcome of a call/email/meeting activity — freeform-flavored but constrained to a fixed vocabulary, matching this codebase's standard enum-not-freetext convention; nothing wrote a non-null `outcome` before Phase 11.5C, so constraining it now is safe. */
export const CONTACT_ACTIVITY_OUTCOMES = [
  "CONNECTED",
  "NO_ANSWER",
  "LEFT_MESSAGE",
  "EMAIL_SENT",
  "EMAIL_DRAFTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "WRONG_PERSON",
  "REFERRED",
  "FOLLOW_UP_REQUIRED",
  "COMPLETED",
  "OTHER",
] as const;
export type ContactActivityOutcome = (typeof CONTACT_ACTIVITY_OUTCOMES)[number];

/** CRM-style activity log entry for a Contact — one row per call/email/meeting/note/status-change, append-only. */
const ContactActivitySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    contactId: { type: String, required: true, index: true },
    activityType: { type: String, enum: CONTACT_ACTIVITY_TYPES, required: true, index: true },
    activityDate: { type: Date, required: true },
    title: { type: String },
    description: { type: String },
    outcome: { type: String, enum: CONTACT_ACTIVITY_OUTCOMES },
    /** Which related record (if any) this activity concerns — e.g. a call logged specifically about a contact's Vendor Registration link, when a contact is linked to more than one record. Optional; a contact-general activity leaves both null. */
    relatedRecordType: { type: String, enum: CONTACT_LINKABLE_RECORD_TYPES },
    relatedRecordId: { type: String },
    nextFollowUpAt: { type: Date },
    createdBy: { type: String },
  },
  createdAtOnly,
);
ContactActivitySchema.index({ workspaceId: 1, contactId: 1, activityDate: -1 });

export const ContactActivity = models.ContactActivity ?? model("ContactActivity", ContactActivitySchema);

export type ContactActivity = {
  id: string;
  workspaceId: string;
  contactId: string;
  activityType: ContactActivityType;
  activityDate: Date;
  title: string | null;
  description: string | null;
  outcome: ContactActivityOutcome | null;
  relatedRecordType: ContactLinkableRecordType | null;
  relatedRecordId: string | null;
  nextFollowUpAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

export const CONTACT_IMPORT_BATCH_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type ContactImportBatchStatus = (typeof CONTACT_IMPORT_BATCH_STATUSES)[number];

/** Tracks one CSV-import run of contacts — reserved for a future import pipeline; nothing writes to this in Phase 11.5A (manual entry/linking only). */
const ContactImportBatchSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    sourceType: { type: String, enum: CONTACT_SOURCE_TYPES, default: "CSV_IMPORT" },
    totalRows: { type: Number, default: 0 },
    importedRows: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    status: { type: String, enum: CONTACT_IMPORT_BATCH_STATUSES, default: "PENDING", index: true },
    errorSummary: { type: String },
    createdBy: { type: String },
  },
  timestamps,
);
ContactImportBatchSchema.index({ workspaceId: 1, createdAt: -1 });

export const ContactImportBatch = models.ContactImportBatch ?? model("ContactImportBatch", ContactImportBatchSchema);

export type ContactImportBatch = {
  id: string;
  workspaceId: string;
  fileName: string;
  sourceType: ContactSourceType;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  failedRows: number;
  status: ContactImportBatchStatus;
  errorSummary: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};
