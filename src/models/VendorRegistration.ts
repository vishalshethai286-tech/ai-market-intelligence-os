import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

/** One entry per raw result that contributed to or re-confirmed this vendor registration — same shape/purpose as TargetCustomer/TenderBuyer's embedded source list. */
const VendorRegistrationSourceHistoryEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    rawSearchResultId: { type: String, required: true },
    discoveryRunId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A vendor/supplier registration opportunity extracted from a Phase 6
 * RawSearchResult (searchType=VENDOR_REGISTRATION) — the Phase 11
 * counterpart to TenderBuyer (Phase 10), reusing the same Discovery Brain →
 * Search Execution → extraction → dedup shape. No scoring service —
 * registrations are tracked through a review/apply workflow, not prioritized
 * like TenderOpportunity.
 */
const VendorRegistrationSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, index: true },
    country: { type: String, index: true },
    address: { type: String },
    phoneNumber: { type: String },
    website: { type: String },
    websiteDomain: { type: String, index: true },
    vendorRegistrationLink: { type: String, index: true },
    registrationType: { type: String },
    requiredDocuments: { type: [String], default: [] },
    sourceUrl: { type: String },
    sourceHistory: { type: [VendorRegistrationSourceHistoryEntrySchema], default: [] },
    matchedProductServiceId: { type: String },
    matchedProductServiceName: { type: String },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "ARCHIVED"],
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
VendorRegistrationSchema.index({ workspaceId: 1, createdAt: -1 });
VendorRegistrationSchema.index({ workspaceId: 1, duplicateKey: 1 });
VendorRegistrationSchema.index({ workspaceId: 1, country: 1 });

export const VendorRegistration = models.VendorRegistration ?? model("VendorRegistration", VendorRegistrationSchema);

export type VendorRegistrationStatus =
  | "NEW"
  | "REVIEWED"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED";
export type VendorRegistrationDuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE" | "MERGED" | "REJECTED";

export type VendorRegistrationSourceHistoryEntry = {
  url: string;
  rawSearchResultId: string;
  discoveryRunId: string;
  retrievedAt: Date;
};

export type VendorRegistration = {
  id: string;
  workspaceId: string;
  customerName: string;
  country: string | null;
  address: string | null;
  phoneNumber: string | null;
  website: string | null;
  websiteDomain: string | null;
  vendorRegistrationLink: string | null;
  registrationType: string | null;
  requiredDocuments: string[];
  sourceUrl: string | null;
  sourceHistory: VendorRegistrationSourceHistoryEntry[];
  matchedProductServiceId: string | null;
  matchedProductServiceName: string | null;
  status: VendorRegistrationStatus;
  lastVerifiedAt: Date | null;
  duplicateStatus: VendorRegistrationDuplicateStatus;
  duplicateKey: string | null;
  rawSearchResultId: string;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
};
