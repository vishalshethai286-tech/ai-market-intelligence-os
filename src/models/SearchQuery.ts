import { Schema, models, model } from "mongoose";
import { idField, timestamps, DISCOVERY_STATUSES, SEARCH_TYPES, CONTACT_RELATED_RECORD_TYPES } from "./shared";
import type { DiscoveryStatus, SearchType, ContactRelatedRecordType } from "./shared";

const SearchQuerySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    /** Ties back to the BusinessBrain that grounded this query (both generators below set this). */
    brainId: { type: String, required: true, index: true },
    /** Set by the AI query generator (src/lib/search-queries) — freeform categories phrased by Claude from Business Brain context. Not set by the Discovery Brain generator, which uses `searchType` instead. */
    category: {
      type: String,
      enum: [
        "TARGET_CUSTOMER",
        "BUYER_TYPE",
        "INDUSTRY_COMPANY",
        "PRODUCT_SERVICE_BUYER",
        "COUNTRY_SPECIFIC",
        "VENDOR_REGISTRATION",
        "PROJECT",
      ],
    },
    query: { type: String, required: true },
    /** Set by the AI query generator — its explanation of which fact(s) this query was grounded in. */
    basedOn: { type: String },
    /** Set by the Discovery Brain generator (src/lib/discovery-brain) — what kind of discovery this query is for. Not set by the AI generator, which uses `category` instead. */
    searchType: { type: String, enum: SEARCH_TYPES },
    /** Discovery Brain generator only: which ProductService this query targets, if any. */
    productServiceId: { type: String, index: true },
    industry: { type: String },
    buyerType: { type: String },
    /** ISO 3166-1 alpha-2 country code. */
    country: { type: String },
    /** ISO 639-1 language code. */
    language: { type: String },
    /** Simple ranking hint for a future execution phase — higher runs first. No ordering logic consumes this yet. */
    priority: { type: Number, default: 0 },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "QUEUED", index: true },
    /** When this query was last actually run against a search provider — nothing sets this yet, since no execution phase exists. */
    lastRunAt: { type: Date },
    /**
     * Contact Discovery (Phase 11.5B) only: which kind of record this
     * CONTACT-searchType query was generated for, and that record's id/company
     * info — lets the contact processor trace a RawSearchResult back to its
     * originating ContactDiscoveryTarget (via searchQueryId) without adding
     * these fields to RawSearchResult/SearchQueueItem, since the executor
     * already looks up the SearchQuery for every result it stores.
     */
    relatedRecordType: { type: String, enum: CONTACT_RELATED_RECORD_TYPES, index: true },
    relatedRecordId: { type: String, index: true },
    relatedCompanyName: { type: String },
    relatedCompanyDomain: { type: String },
  },
  timestamps,
);
SearchQuerySchema.index({ workspaceId: 1, query: 1 }, { unique: true });
SearchQuerySchema.index({ workspaceId: 1, category: 1 });
SearchQuerySchema.index({ workspaceId: 1, searchType: 1 });
SearchQuerySchema.index({ workspaceId: 1, status: 1 });
SearchQuerySchema.index({ workspaceId: 1, relatedRecordType: 1, relatedRecordId: 1 });

export const SearchQuery = models.SearchQuery ?? model("SearchQuery", SearchQuerySchema);

export type SearchQueryCategory =
  | "TARGET_CUSTOMER"
  | "BUYER_TYPE"
  | "INDUSTRY_COMPANY"
  | "PRODUCT_SERVICE_BUYER"
  | "COUNTRY_SPECIFIC"
  | "VENDOR_REGISTRATION"
  | "PROJECT";

export type SearchQuery = {
  id: string;
  workspaceId: string;
  brainId: string;
  category: SearchQueryCategory | null;
  query: string;
  basedOn: string | null;
  searchType: SearchType | null;
  productServiceId: string | null;
  industry: string | null;
  buyerType: string | null;
  country: string | null;
  language: string | null;
  priority: number;
  status: DiscoveryStatus;
  lastRunAt: Date | null;
  relatedRecordType: ContactRelatedRecordType | null;
  relatedRecordId: string | null;
  relatedCompanyName: string | null;
  relatedCompanyDomain: string | null;
  createdAt: Date;
  updatedAt: Date;
};
