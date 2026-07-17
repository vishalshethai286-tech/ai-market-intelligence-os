import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly, DISCOVERY_STATUSES, SEARCH_TYPES } from "./shared";
import type { DiscoveryStatus, SearchType, SourceType } from "./shared";

/**
 * The workspace's discovery-planning state — distinct from BusinessBrain
 * (which holds company/product knowledge and is this subsystem's source of
 * truth for content). DiscoveryBrain tracks the state of turning that
 * knowledge into search queries and a queue: when the queue was last
 * (re)generated and rough size counters for the UI, without re-querying
 * SearchQuery/SearchQueueItem just to show a summary.
 */
const DiscoveryBrainSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, unique: true },
    businessBrainId: { type: String, required: true, index: true },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    lastQueueGeneratedAt: { type: Date },
    totalSearchQueries: { type: Number, default: 0 },
    totalQueueItems: { type: Number, default: 0 },
  },
  timestamps,
);

export const DiscoveryBrain = models.DiscoveryBrain ?? model("DiscoveryBrain", DiscoveryBrainSchema);

export type DiscoveryBrain = {
  id: string;
  workspaceId: string;
  businessBrainId: string;
  status: DiscoveryStatus;
  lastQueueGeneratedAt: Date | null;
  totalSearchQueries: number;
  totalQueueItems: number;
  createdAt: Date;
  updatedAt: Date;
};

const SearchSourceSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    sourceName: { type: String, required: true },
    sourceType: {
      type: String,
      required: true,
      enum: [
        "SEARCH_ENGINE",
        "TENDER_PORTAL",
        "BUSINESS_DIRECTORY",
        "GOVERNMENT_PORTAL",
        "INDUSTRY_ASSOCIATION",
        "NEWS_SOURCE",
        "COMPANY_WEBSITE",
        "MANUAL_SOURCE",
      ],
    },
    country: { type: String },
    industry: { type: String },
    baseUrl: { type: String },
    /** Free text describing how this source is queried (e.g. "API", "scrape", "manual lookup") — not a fixed vocabulary. */
    searchMethod: { type: String },
    apiProvider: { type: String },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    lastSearchedAt: { type: Date },
    /** 0-1, how trustworthy/productive this source has been — nothing computes this automatically yet. */
    reliabilityScore: { type: Number, default: 0 },
  },
  timestamps,
);
SearchSourceSchema.index({ workspaceId: 1, sourceType: 1 });

export const SearchSource = models.SearchSource ?? model("SearchSource", SearchSourceSchema);

export type SearchSource = {
  id: string;
  workspaceId: string;
  sourceName: string;
  sourceType: SourceType;
  country: string | null;
  industry: string | null;
  baseUrl: string | null;
  searchMethod: string | null;
  apiProvider: string | null;
  status: DiscoveryStatus;
  lastSearchedAt: Date | null;
  reliabilityScore: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One queued unit of search work, referencing the SearchQuery whose text
 * should eventually be run. Separate from SearchQuery itself so a query can
 * be re-queued/retried without mutating the query record, and so job-style
 * fields (attempts, scheduledFor, startedAt/finishedAt, errorMessage) don't
 * clutter the query model. Nothing in this codebase transitions status past
 * QUEUED yet — no execution phase exists.
 */
const SearchQueueItemSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    searchQueryId: { type: String, required: true, index: true },
    searchType: { type: String, required: true, enum: SEARCH_TYPES },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "QUEUED", index: true },
    priority: { type: Number, default: 0 },
    scheduledFor: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  timestamps,
);
SearchQueueItemSchema.index({ workspaceId: 1, searchQueryId: 1 }, { unique: true });
SearchQueueItemSchema.index({ workspaceId: 1, searchType: 1 });

export const SearchQueueItem = models.SearchQueueItem ?? model("SearchQueueItem", SearchQueueItemSchema);

export type SearchQueueItem = {
  id: string;
  workspaceId: string;
  searchQueryId: string;
  searchType: SearchType;
  status: DiscoveryStatus;
  priority: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CountryCoverageSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    countryCode: { type: String, required: true },
    countryName: { type: String, required: true },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    queriesTotal: { type: Number, default: 0 },
    queriesCompleted: { type: Number, default: 0 },
    lastSearchedAt: { type: Date },
  },
  timestamps,
);
CountryCoverageSchema.index({ workspaceId: 1, countryCode: 1 }, { unique: true });

export const CountryCoverage = models.CountryCoverage ?? model("CountryCoverage", CountryCoverageSchema);

export type CountryCoverage = {
  id: string;
  workspaceId: string;
  countryCode: string;
  countryName: string;
  status: DiscoveryStatus;
  queriesTotal: number;
  queriesCompleted: number;
  lastSearchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const IndustryCoverageSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    industry: { type: String, required: true },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    queriesTotal: { type: Number, default: 0 },
    queriesCompleted: { type: Number, default: 0 },
    lastSearchedAt: { type: Date },
  },
  timestamps,
);
IndustryCoverageSchema.index({ workspaceId: 1, industry: 1 }, { unique: true });

export const IndustryCoverage = models.IndustryCoverage ?? model("IndustryCoverage", IndustryCoverageSchema);

export type IndustryCoverage = {
  id: string;
  workspaceId: string;
  industry: string;
  status: DiscoveryStatus;
  queriesTotal: number;
  queriesCompleted: number;
  lastSearchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ProductCoverageSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    productServiceId: { type: String, required: true },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    queriesTotal: { type: Number, default: 0 },
    queriesCompleted: { type: Number, default: 0 },
    lastSearchedAt: { type: Date },
  },
  timestamps,
);
ProductCoverageSchema.index({ workspaceId: 1, productServiceId: 1 }, { unique: true });

export const ProductCoverage = models.ProductCoverage ?? model("ProductCoverage", ProductCoverageSchema);

export type ProductCoverage = {
  id: string;
  workspaceId: string;
  productServiceId: string;
  status: DiscoveryStatus;
  queriesTotal: number;
  queriesCompleted: number;
  lastSearchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const SourceCoverageSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    searchSourceId: { type: String, required: true },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
    queriesTotal: { type: Number, default: 0 },
    queriesCompleted: { type: Number, default: 0 },
    lastSearchedAt: { type: Date },
  },
  timestamps,
);
SourceCoverageSchema.index({ workspaceId: 1, searchSourceId: 1 }, { unique: true });

export const SourceCoverage = models.SourceCoverage ?? model("SourceCoverage", SourceCoverageSchema);

export type SourceCoverage = {
  id: string;
  workspaceId: string;
  searchSourceId: string;
  status: DiscoveryStatus;
  queriesTotal: number;
  queriesCompleted: number;
  lastSearchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A point-in-time rollup of coverage across every dimension, for the
 * Discovery Brain page's summary stats — recomputed (and a new row
 * appended, kept as history) whenever the queue is (re)generated, rather
 * than computed fresh on every page load.
 */
const CoverageSnapshotSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    capturedAt: { type: Date, default: Date.now },
    countriesSearched: { type: Number, default: 0 },
    countriesPending: { type: Number, default: 0 },
    countriesNeedingRefresh: { type: Number, default: 0 },
    productsSearched: { type: Number, default: 0 },
    industriesSearched: { type: Number, default: 0 },
    sourcesSearched: { type: Number, default: 0 },
    sourcesPending: { type: Number, default: 0 },
    coveragePercentage: { type: Number, default: 0 },
    /** Per-searchType breakdown: { CUSTOMER: { total, completed }, PROJECT: {...}, ... } */
    bySearchType: { type: Schema.Types.Mixed, default: {} },
  },
  createdAtOnly,
);
CoverageSnapshotSchema.index({ workspaceId: 1, capturedAt: -1 });

export const CoverageSnapshot = models.CoverageSnapshot ?? model("CoverageSnapshot", CoverageSnapshotSchema);

export type CoverageBySearchTypeEntry = { total: number; completed: number };

export type CoverageSnapshot = {
  id: string;
  workspaceId: string;
  capturedAt: Date;
  countriesSearched: number;
  countriesPending: number;
  countriesNeedingRefresh: number;
  productsSearched: number;
  industriesSearched: number;
  sourcesSearched: number;
  sourcesPending: number;
  coveragePercentage: number;
  bySearchType: Partial<Record<SearchType, CoverageBySearchTypeEntry>>;
  createdAt: Date;
};

/**
 * The current discovery plan for a workspace — which dimensions/priorities
 * are in play, for the Discovery Brain page's "strategy summary". One row
 * per queue-generation run (kept as history); the page reads the latest.
 */
const DiscoveryStrategySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    businessBrainId: { type: String, required: true },
    summary: { type: String, required: true },
    totalProducts: { type: Number, default: 0 },
    totalIndustries: { type: Number, default: 0 },
    totalCountries: { type: Number, default: 0 },
    totalBuyerTypes: { type: Number, default: 0 },
    priorityCountries: { type: [String], default: [] },
    priorityIndustries: { type: [String], default: [] },
    status: { type: String, enum: DISCOVERY_STATUSES, default: "NOT_STARTED" },
  },
  timestamps,
);
DiscoveryStrategySchema.index({ workspaceId: 1, createdAt: -1 });

export const DiscoveryStrategy = models.DiscoveryStrategy ?? model("DiscoveryStrategy", DiscoveryStrategySchema);

export type DiscoveryStrategy = {
  id: string;
  workspaceId: string;
  businessBrainId: string;
  summary: string;
  totalProducts: number;
  totalIndustries: number;
  totalCountries: number;
  totalBuyerTypes: number;
  priorityCountries: string[];
  priorityIndustries: string[];
  status: DiscoveryStatus;
  createdAt: Date;
  updatedAt: Date;
};
