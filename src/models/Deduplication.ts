import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly, DEDUP_RECORD_TYPES, DUPLICATE_RECORD_STATUSES } from "./shared";
import type { DedupRecordType, DuplicateRecordStatus } from "./shared";

/**
 * One candidate duplicate pair for any record type (customer today; project/
 * tender/vendor-registration once those models exist). Never deleted once
 * resolved — status tracks the pair's own lifecycle, separate from
 * whatever duplicateStatus flag lives on the underlying record itself.
 */
const DuplicateRecordSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    recordType: { type: String, required: true, enum: DEDUP_RECORD_TYPES, index: true },
    primaryRecordId: { type: String, required: true, index: true },
    duplicateRecordId: { type: String, required: true, index: true },
    duplicateScore: { type: Number, required: true, index: true },
    duplicateReason: { type: String },
    matchingFields: { type: [String], default: [] },
    conflictingFields: { type: [String], default: [] },
    status: { type: String, enum: DUPLICATE_RECORD_STATUSES, default: "PENDING_REVIEW", index: true },
  },
  timestamps,
);
DuplicateRecordSchema.index({ workspaceId: 1, recordType: 1, status: 1 });
DuplicateRecordSchema.index({ workspaceId: 1, createdAt: -1 });

export const DuplicateRecord = models.DuplicateRecord ?? model("DuplicateRecord", DuplicateRecordSchema);

export type DuplicateRecord = {
  id: string;
  workspaceId: string;
  recordType: DedupRecordType;
  primaryRecordId: string;
  duplicateRecordId: string;
  duplicateScore: number;
  duplicateReason: string | null;
  matchingFields: string[];
  conflictingFields: string[];
  status: DuplicateRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** Append-only record of a merge event — the audit trail for "what got merged into what, and why." */
const MergeHistorySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    recordType: { type: String, required: true, enum: DEDUP_RECORD_TYPES, index: true },
    primaryRecordId: { type: String, required: true, index: true },
    mergedRecordId: { type: String, required: true, index: true },
    mergeReason: { type: String },
    mergedFields: { type: [String], default: [] },
    preservedSources: { type: [String], default: [] },
    /** null for an automatic (system) merge — a real userId for a manual merge. */
    mergedBy: { type: String },
    mergedAt: { type: Date, required: true },
  },
  createdAtOnly,
);
MergeHistorySchema.index({ workspaceId: 1, primaryRecordId: 1 });

export const MergeHistory = models.MergeHistory ?? model("MergeHistory", MergeHistorySchema);

export type MergeHistory = {
  id: string;
  workspaceId: string;
  recordType: DedupRecordType;
  primaryRecordId: string;
  mergedRecordId: string;
  mergeReason: string | null;
  mergedFields: string[];
  preservedSources: string[];
  mergedBy: string | null;
  mergedAt: Date;
  createdAt: Date;
};

/**
 * Append-only field-level change log — one row per field a merge (or future
 * re-verification) actually changed, with the source that justified the
 * change. Distinct from TargetCustomer.sourceHistory (Phase 7's embedded
 * "which raw results mention this customer" list): this is a generic,
 * cross-record-type audit trail of *value changes*, not source mentions.
 */
const SourceHistorySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    recordType: { type: String, required: true, enum: DEDUP_RECORD_TYPES, index: true },
    recordId: { type: String, required: true, index: true },
    fieldName: { type: String, required: true },
    oldValue: { type: String },
    newValue: { type: String },
    sourceUrl: { type: String },
    confidenceScore: { type: Number, default: 0 },
    capturedAt: { type: Date, required: true },
  },
  createdAtOnly,
);
SourceHistorySchema.index({ workspaceId: 1, recordType: 1, recordId: 1 });

export const SourceHistory = models.SourceHistory ?? model("SourceHistory", SourceHistorySchema);

export type SourceHistory = {
  id: string;
  workspaceId: string;
  recordType: DedupRecordType;
  recordId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  sourceUrl: string | null;
  confidenceScore: number;
  capturedAt: Date;
  createdAt: Date;
};

/**
 * Append-only log of a field being re-verified against a source (distinct
 * from a merge-driven change in SourceHistory above) — e.g. a future
 * re-crawl confirming a phone number is still correct. Not yet written by
 * any Phase 8 code path; the model exists so re-verification can be added
 * later without a schema change.
 */
const RecordVerificationLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    recordType: { type: String, required: true, enum: DEDUP_RECORD_TYPES, index: true },
    recordId: { type: String, required: true, index: true },
    verificationType: { type: String, required: true },
    previousValue: { type: String },
    newValue: { type: String },
    sourceUrl: { type: String },
    confidenceScore: { type: Number, default: 0 },
    verifiedAt: { type: Date, required: true },
  },
  createdAtOnly,
);
RecordVerificationLogSchema.index({ workspaceId: 1, recordType: 1, recordId: 1 });

export const RecordVerificationLog = models.RecordVerificationLog ?? model("RecordVerificationLog", RecordVerificationLogSchema);

export type RecordVerificationLog = {
  id: string;
  workspaceId: string;
  recordType: DedupRecordType;
  recordId: string;
  verificationType: string;
  previousValue: string | null;
  newValue: string | null;
  sourceUrl: string | null;
  confidenceScore: number;
  verifiedAt: Date;
  createdAt: Date;
};
