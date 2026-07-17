import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

/** One entry per raw result that contributed to or re-confirmed this tender buyer — same shape/purpose as TargetCustomer/ProjectOpportunity's embedded source list. */
const TenderBuyerSourceHistoryEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    rawSearchResultId: { type: String, required: true },
    discoveryRunId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A procurement body/buyer that publishes tenders, extracted from a Phase 6
 * RawSearchResult (searchType=TENDER) — the Phase 10 counterpart to
 * TargetCustomer (Phase 7) / ProjectOpportunity (Phase 9), reusing the same
 * Discovery Brain → Search Execution → extraction → dedup shape. No scoring
 * service — buyers aren't prioritized the way opportunities are, only
 * reviewed/approved like a customer record.
 */
const TenderBuyerSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, index: true },
    country: { type: String, index: true },
    address: { type: String },
    phoneNumber: { type: String },
    website: { type: String },
    websiteDomain: { type: String, index: true },
    tenderWebsiteLink: { type: String, index: true },
    sourceUrl: { type: String },
    sourceHistory: { type: [TenderBuyerSourceHistoryEntrySchema], default: [] },
    lastVerifiedAt: { type: Date, index: true },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"],
      default: "NEW",
      index: true,
    },
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
TenderBuyerSchema.index({ workspaceId: 1, createdAt: -1 });
TenderBuyerSchema.index({ workspaceId: 1, duplicateKey: 1 });
TenderBuyerSchema.index({ workspaceId: 1, country: 1 });

export const TenderBuyer = models.TenderBuyer ?? model("TenderBuyer", TenderBuyerSchema);

export type TenderBuyerStatus = "NEW" | "REVIEWED" | "APPROVED" | "REJECTED" | "WATCHING" | "CONTACTED" | "ARCHIVED";
export type TenderBuyerDuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE" | "MERGED" | "REJECTED";

export type TenderBuyerSourceHistoryEntry = {
  url: string;
  rawSearchResultId: string;
  discoveryRunId: string;
  retrievedAt: Date;
};

export type TenderBuyer = {
  id: string;
  workspaceId: string;
  customerName: string;
  country: string | null;
  address: string | null;
  phoneNumber: string | null;
  website: string | null;
  websiteDomain: string | null;
  tenderWebsiteLink: string | null;
  sourceUrl: string | null;
  sourceHistory: TenderBuyerSourceHistoryEntry[];
  lastVerifiedAt: Date | null;
  status: TenderBuyerStatus;
  duplicateStatus: TenderBuyerDuplicateStatus;
  duplicateKey: string | null;
  rawSearchResultId: string;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
};
