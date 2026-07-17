/** Every model uses a random string id (not ObjectId) so app code keeps treating `.id` as a plain string, matching the old Prisma cuid ids. */
export const idField = { _id: { type: String, default: () => crypto.randomUUID() } };

/**
 * `virtuals: true` is required here — Mongoose's `id` virtual (the plain
 * string form of `_id` that the rest of this app relies on) is NOT included
 * in `.toObject()`/`.toJSON()` output by default, only `_id` is. Without
 * this, every `.toObject()` call across the app silently drops `.id`.
 */
const outputOptions = { toObject: { virtuals: true }, toJSON: { virtuals: true } } as const;

/** Standard createdAt/updatedAt behavior matching Prisma's @default(now())/@updatedAt. */
export const timestamps = { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }, ...outputOptions } as const;

/** For append-only log models (Prisma's `createdAt` only, no `updatedAt`). */
export const createdAtOnly = { timestamps: { createdAt: "createdAt", updatedAt: false }, ...outputOptions } as const;

/** Converts a hydrated Mongoose document (or array of them) into a plain object safe to pass across the Server/Client Component boundary — mirrors what Prisma always returned. */
export function toPlain<T>(doc: T): T {
  return (doc as unknown as { toObject: () => T }).toObject();
}

export function toPlainArray<T>(docs: T[]): T[] {
  return docs.map((doc) => toPlain(doc));
}

export type WithId<T> = T & { id: string };

/**
 * Universal lifecycle status shared across the Discovery Brain subsystem
 * (SearchQuery, SearchQueueItem, SearchSource, and every *Coverage model) —
 * one vocabulary for "where is this thing in the discovery pipeline"
 * instead of a different enum per model.
 */
export const DISCOVERY_STATUSES = [
  "NOT_STARTED",
  "QUEUED",
  "SEARCHING",
  "PARTIALLY_COVERED",
  "COVERED",
  "NEEDS_REFRESH",
  "FAILED",
] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

/** What a discovery search is trying to find. */
export const SEARCH_TYPES = ["CUSTOMER", "PROJECT", "TENDER", "VENDOR_REGISTRATION", "CONTACT"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Which kind of record a CONTACT-searchType SearchQuery/ContactDiscoveryTarget was generated for — lets the contact processor resolve the right related entity and link a discovered Contact back to it. */
export const CONTACT_RELATED_RECORD_TYPES = [
  "TARGET_CUSTOMER",
  "PROJECT_OPPORTUNITY",
  "TENDER_BUYER",
  "TENDER_OPPORTUNITY",
  "VENDOR_REGISTRATION",
  "MANUAL_COMPANY",
] as const;
export type ContactRelatedRecordType = (typeof CONTACT_RELATED_RECORD_TYPES)[number];

/** The 5 real, linkable entity types a Contact/ContactActivity/ContactTask can point to — same values as CONTACT_RELATED_RECORD_TYPES minus MANUAL_COMPANY (which has no backing model to link to). Shared by contacts/service.ts's RelatedRecordType, ContactActivity.relatedRecordType, and ContactTask.relatedRecordType so all three stay structurally identical. */
export const CONTACT_LINKABLE_RECORD_TYPES = [
  "TARGET_CUSTOMER",
  "PROJECT_OPPORTUNITY",
  "TENDER_BUYER",
  "TENDER_OPPORTUNITY",
  "VENDOR_REGISTRATION",
] as const;
export type ContactLinkableRecordType = (typeof CONTACT_LINKABLE_RECORD_TYPES)[number];

/** Where a SearchSource gets its results from. */
export const SOURCE_TYPES = [
  "SEARCH_ENGINE",
  "TENDER_PORTAL",
  "BUSINESS_DIRECTORY",
  "GOVERNMENT_PORTAL",
  "INDUSTRY_ASSOCIATION",
  "NEWS_SOURCE",
  "COMPANY_WEBSITE",
  "MANUAL_SOURCE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Job-execution lifecycle for a DiscoveryRun/DiscoveryRunItem — distinct from DiscoveryStatus (coverage-dimension state), since a run is a one-shot job, not a dimension that can be "partially covered". */
export const RUN_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Who/what kicked off a DiscoveryRun. */
export const RUN_TYPES = ["MANUAL", "DAILY", "SCHEDULED_PLACEHOLDER"] as const;
export type RunType = (typeof RUN_TYPES)[number];

/** Whether a RawSearchResult has been picked up for downstream processing yet (Phase 6 stores raw results only — nothing transitions this past UNPROCESSED/IGNORED in this phase). */
export const PROCESSED_STATUSES = ["UNPROCESSED", "PROCESSING", "PROCESSED", "FAILED", "IGNORED"] as const;
export type ProcessedStatus = (typeof PROCESSED_STATUSES)[number];

/** Whether a RawSearchResult has been turned into a customer/project/tender/vendor-registration record — a future phase's concern; every row stays NOT_STARTED here. */
export const EXTRACTION_STATUSES = ["NOT_STARTED", "PENDING", "EXTRACTED", "FAILED", "SKIPPED"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** Outcome of a single provider HTTP request, for SearchProviderLog. */
export const PROVIDER_LOG_STATUSES = ["SUCCESS", "FAILED", "TIMEOUT"] as const;
export type ProviderLogStatus = (typeof PROVIDER_LOG_STATUSES)[number];

/**
 * Record types the Phase 8 deduplication system understands — CUSTOMER is
 * the only one with a real backing model + engine today; the rest are
 * placeholders for when project/tender/vendor-registration discovery is
 * built (each gets its own model, but shares this same DuplicateRecord/
 * MergeHistory/SourceHistory/RecordVerificationLog machinery).
 */
export const DEDUP_RECORD_TYPES = ["CUSTOMER", "PROJECT", "TENDER_BUYER", "TENDER_OPPORTUNITY", "VENDOR_REGISTRATION"] as const;
export type DedupRecordType = (typeof DEDUP_RECORD_TYPES)[number];

/** Lifecycle of a single DuplicateRecord (a candidate pair), distinct from a record's own duplicateStatus flag. */
export const DUPLICATE_RECORD_STATUSES = [
  "PENDING_REVIEW",
  "AUTO_MERGED",
  "MANUALLY_MERGED",
  "NOT_DUPLICATE",
  "REJECTED",
  "ARCHIVED",
] as const;
export type DuplicateRecordStatus = (typeof DUPLICATE_RECORD_STATUSES)[number];
