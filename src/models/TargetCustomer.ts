import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

/** One entry per raw result that contributed to or re-confirmed this customer — preserves every source instead of overwriting sourceUrl. */
const SourceHistoryEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    rawSearchResultId: { type: String, required: true },
    discoveryRunId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A structured target customer extracted from a Phase 6 RawSearchResult —
 * the Phase 7 counterpart to the older, ad-hoc TargetCompany model (Phase
 * 3/4's discoverAndExtractTargetCompanies pipeline, which searches and
 * extracts directly rather than going through the Discovery Brain's queue/
 * execution/raw-results pipeline). Both models remain in the codebase;
 * TargetCustomer is what /dashboard/customers renders going forward.
 */
const TargetCustomerSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, index: true },
    country: { type: String, index: true },
    website: { type: String },
    websiteDomain: { type: String, index: true },
    address: { type: String },
    phoneNumber: { type: String },
    score: { type: Number, default: 0, index: true },
    priority: { type: String, enum: ["A_PLUS", "A", "B", "C"], index: true },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "APPROVED", "REJECTED", "CONTACTED", "CONVERTED", "ARCHIVED"],
      default: "NEW",
      index: true,
    },
    sourceUrl: { type: String },
    sourceHistory: { type: [SourceHistoryEntrySchema], default: [] },
    matchedProductServiceId: { type: String },
    matchedProductServiceName: { type: String },
    matchedIndustry: { type: String },
    buyerType: { type: String },
    aiRelevanceExplanation: { type: String },
    confidenceScore: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date },
    duplicateStatus: {
      type: String,
      enum: ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"],
      default: "UNIQUE",
    },
    duplicateKey: { type: String, index: true },
    rawSearchResultId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true },
  },
  timestamps,
);
TargetCustomerSchema.index({ workspaceId: 1, createdAt: -1 });
TargetCustomerSchema.index({ workspaceId: 1, lastVerifiedAt: -1 });
TargetCustomerSchema.index({ workspaceId: 1, websiteDomain: 1 });
TargetCustomerSchema.index({ workspaceId: 1, duplicateKey: 1 });

export const TargetCustomer = models.TargetCustomer ?? model("TargetCustomer", TargetCustomerSchema);

export type TargetCustomerStatus = "NEW" | "REVIEWED" | "APPROVED" | "REJECTED" | "CONTACTED" | "CONVERTED" | "ARCHIVED";
export type TargetCustomerPriority = "A_PLUS" | "A" | "B" | "C";
export type TargetCustomerDuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE" | "MERGED" | "REJECTED";

export type SourceHistoryEntry = {
  url: string;
  rawSearchResultId: string;
  discoveryRunId: string;
  retrievedAt: Date;
};

export type TargetCustomer = {
  id: string;
  workspaceId: string;
  customerName: string;
  country: string | null;
  website: string | null;
  websiteDomain: string | null;
  address: string | null;
  phoneNumber: string | null;
  score: number;
  priority: TargetCustomerPriority | null;
  status: TargetCustomerStatus;
  sourceUrl: string | null;
  sourceHistory: SourceHistoryEntry[];
  matchedProductServiceId: string | null;
  matchedProductServiceName: string | null;
  matchedIndustry: string | null;
  buyerType: string | null;
  aiRelevanceExplanation: string | null;
  confidenceScore: number;
  lastVerifiedAt: Date | null;
  duplicateStatus: TargetCustomerDuplicateStatus;
  duplicateKey: string | null;
  rawSearchResultId: string;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
};
