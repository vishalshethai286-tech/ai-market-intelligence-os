import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

/** One entry per raw result that contributed to or re-confirmed this tender — same shape/purpose as TargetCustomer/ProjectOpportunity/TenderBuyer's embedded source list. */
const TenderOpportunitySourceHistoryEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    rawSearchResultId: { type: String, required: true },
    discoveryRunId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A live, publicly-announced tender opportunity extracted from a Phase 6
 * RawSearchResult (searchType=TENDER) — the Phase 10 counterpart to
 * ProjectOpportunity (Phase 9), reusing the same Discovery Brain → Search
 * Execution → extraction → scoring → dedup shape.
 */
const TenderOpportunitySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    customerName: { type: String, index: true },
    buyerOrganization: { type: String, required: true, index: true },
    tenderTitle: { type: String, required: true, index: true },
    tenderDescription: { type: String },
    startDate: { type: Date },
    endDate: { type: Date, index: true },
    tenderLink: { type: String, index: true },
    country: { type: String, index: true },
    productsServicesRequired: { type: [String], default: [] },
    matchedProductServiceId: { type: String },
    matchedProductServiceName: { type: String },
    priorityScore: { type: Number, default: 0, index: true },
    priority: { type: String, enum: ["A_PLUS", "A", "B", "C"], index: true },
    sourceUrl: { type: String },
    sourceHistory: { type: [TenderOpportunitySourceHistoryEntrySchema], default: [] },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "ELIGIBLE", "NOT_ELIGIBLE", "SUBMITTED", "WON", "LOST", "EXPIRED", "ARCHIVED"],
      default: "NEW",
      index: true,
    },
    lastVerifiedAt: { type: Date, index: true },
    duplicateStatus: {
      type: String,
      enum: ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"],
      default: "UNIQUE",
      index: true,
    },
    duplicateKey: { type: String, index: true },
    rawSearchResultId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
  },
  timestamps,
);
TenderOpportunitySchema.index({ workspaceId: 1, createdAt: -1 });
TenderOpportunitySchema.index({ workspaceId: 1, duplicateKey: 1 });
TenderOpportunitySchema.index({ workspaceId: 1, endDate: 1 });

export const TenderOpportunity = models.TenderOpportunity ?? model("TenderOpportunity", TenderOpportunitySchema);

export type TenderOpportunityStatus = "NEW" | "REVIEWED" | "ELIGIBLE" | "NOT_ELIGIBLE" | "SUBMITTED" | "WON" | "LOST" | "EXPIRED" | "ARCHIVED";
export type TenderOpportunityPriority = "A_PLUS" | "A" | "B" | "C";
export type TenderOpportunityDuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE" | "MERGED" | "REJECTED";

export type TenderOpportunitySourceHistoryEntry = {
  url: string;
  rawSearchResultId: string;
  discoveryRunId: string;
  retrievedAt: Date;
};

export type TenderOpportunity = {
  id: string;
  workspaceId: string;
  customerName: string | null;
  buyerOrganization: string;
  tenderTitle: string;
  tenderDescription: string | null;
  startDate: Date | null;
  endDate: Date | null;
  tenderLink: string | null;
  country: string | null;
  productsServicesRequired: string[];
  matchedProductServiceId: string | null;
  matchedProductServiceName: string | null;
  priorityScore: number;
  priority: TenderOpportunityPriority | null;
  sourceUrl: string | null;
  sourceHistory: TenderOpportunitySourceHistoryEntry[];
  status: TenderOpportunityStatus;
  lastVerifiedAt: Date | null;
  duplicateStatus: TenderOpportunityDuplicateStatus;
  duplicateKey: string | null;
  rawSearchResultId: string;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
};
