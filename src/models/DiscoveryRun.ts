import { Schema, models, model } from "mongoose";
import {
  idField,
  timestamps,
  createdAtOnly,
  RUN_STATUSES,
  RUN_TYPES,
  SEARCH_TYPES,
  PROCESSED_STATUSES,
  EXTRACTION_STATUSES,
  PROVIDER_LOG_STATUSES,
} from "./shared";
import type { RunStatus, RunType, SearchType, ProcessedStatus, ExtractionStatus, ProviderLogStatus } from "./shared";

/**
 * One execution of the Search Execution Engine: a batch of queued
 * SearchQueueItems actually run through a search provider. Summarizes what
 * happened (queries executed, raw results found, errors) — the per-query
 * detail lives on DiscoveryRunItem, per-result detail on RawSearchResult.
 */
const DiscoveryRunSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    discoveryBrainId: { type: String, required: true, index: true },
    runType: { type: String, required: true, enum: RUN_TYPES },
    status: { type: String, required: true, enum: RUN_STATUSES, default: "QUEUED", index: true },
    /** Set when this run was filtered to a single search type — null means "all types". */
    searchType: { type: String, enum: SEARCH_TYPES },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    queriesExecuted: { type: Number, default: 0 },
    rawResultsFound: { type: Number, default: 0 },
    /** Always 0 in this phase — extraction (turning raw results into customers/projects/tenders/vendor registrations) doesn't exist yet. */
    recordsExtracted: { type: Number, default: 0 },
    duplicatesFound: { type: Number, default: 0 },
    errorsCount: { type: Number, default: 0 },
    /** Rough cost estimate in USD, summed from SearchProviderLog.estimatedCost — a placeholder until providers report real usage-based billing. */
    estimatedApiCost: { type: Number, default: 0 },
  },
  timestamps,
);
DiscoveryRunSchema.index({ workspaceId: 1, createdAt: -1 });
DiscoveryRunSchema.index({ workspaceId: 1, searchType: 1 });

export const DiscoveryRun = models.DiscoveryRun ?? model("DiscoveryRun", DiscoveryRunSchema);

export type DiscoveryRun = {
  id: string;
  workspaceId: string;
  discoveryBrainId: string;
  runType: RunType;
  status: RunStatus;
  searchType: SearchType | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  queriesExecuted: number;
  rawResultsFound: number;
  recordsExtracted: number;
  duplicatesFound: number;
  errorsCount: number;
  estimatedApiCost: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Per-query detail within a DiscoveryRun — one row per SearchQueueItem the run attempted. */
const DiscoveryRunItemSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
    searchQueueItemId: { type: String, required: true, index: true },
    searchQueryId: { type: String, required: true, index: true },
    searchType: { type: String, required: true, enum: SEARCH_TYPES, index: true },
    query: { type: String, required: true },
    country: { type: String, index: true },
    language: { type: String },
    status: { type: String, required: true, enum: RUN_STATUSES, default: "QUEUED" },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    rawResultsFound: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  timestamps,
);
DiscoveryRunItemSchema.index({ workspaceId: 1, discoveryRunId: 1 });

export const DiscoveryRunItem = models.DiscoveryRunItem ?? model("DiscoveryRunItem", DiscoveryRunItemSchema);

export type DiscoveryRunItem = {
  id: string;
  workspaceId: string;
  discoveryRunId: string;
  searchQueueItemId: string;
  searchQueryId: string;
  searchType: SearchType;
  query: string;
  country: string | null;
  language: string | null;
  status: RunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  rawResultsFound: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One raw search-result row, exactly as returned by a provider — no
 * extraction/interpretation applied. `processedStatus` tracks whether this
 * phase's pipeline has looked at it at all; `extractionStatus` tracks
 * whether a (future, not-yet-built) phase has turned it into a
 * customer/project/tender/vendor-registration record. Every row created in
 * this phase stays UNPROCESSED/NOT_STARTED.
 */
const RawSearchResultSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
    discoveryRunItemId: { type: String, required: true, index: true },
    searchQueryId: { type: String, required: true, index: true },
    searchQueueItemId: { type: String, required: true, index: true },
    searchType: { type: String, required: true, enum: SEARCH_TYPES, index: true },
    query: { type: String, required: true },
    title: { type: String, required: true },
    snippet: { type: String },
    url: { type: String, required: true, index: true },
    domain: { type: String, index: true },
    country: { type: String, index: true },
    language: { type: String },
    sourceProvider: { type: String, required: true, index: true },
    retrievedAt: { type: Date, required: true },
    processedStatus: { type: String, enum: PROCESSED_STATUSES, default: "UNPROCESSED", index: true },
    extractionStatus: { type: String, enum: EXTRACTION_STATUSES, default: "NOT_STARTED", index: true },
    rawPayload: { type: Schema.Types.Mixed },
  },
  timestamps,
);
RawSearchResultSchema.index({ workspaceId: 1, discoveryRunId: 1 });
RawSearchResultSchema.index({ workspaceId: 1, retrievedAt: -1 });
// Same URL can legitimately show up again on a later run (re-verifying it's
// still live) — not unique. Duplicate detection is the executor's job
// (duplicatesFound), not a hard DB constraint here.
RawSearchResultSchema.index({ workspaceId: 1, url: 1 });

export const RawSearchResult = models.RawSearchResult ?? model("RawSearchResult", RawSearchResultSchema);

export type RawSearchResult = {
  id: string;
  workspaceId: string;
  discoveryRunId: string;
  discoveryRunItemId: string;
  searchQueryId: string;
  searchQueueItemId: string;
  searchType: SearchType;
  query: string;
  title: string;
  snippet: string | null;
  url: string;
  domain: string | null;
  country: string | null;
  language: string | null;
  sourceProvider: string;
  retrievedAt: Date;
  processedStatus: ProcessedStatus;
  extractionStatus: ExtractionStatus;
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/** One HTTP request/response cycle against a search provider, for cost tracking and debugging provider issues. Never logs the API key itself. */
const SearchProviderLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    query: { type: String, required: true },
    requestStartedAt: { type: Date, required: true },
    requestFinishedAt: { type: Date },
    status: { type: String, required: true, enum: PROVIDER_LOG_STATUSES },
    resultCount: { type: Number, default: 0 },
    /** Rough per-request cost estimate in USD — a placeholder until providers report real usage-based billing. */
    estimatedCost: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  createdAtOnly,
);
SearchProviderLogSchema.index({ workspaceId: 1, discoveryRunId: 1 });

export const SearchProviderLog = models.SearchProviderLog ?? model("SearchProviderLog", SearchProviderLogSchema);

export type SearchProviderLog = {
  id: string;
  workspaceId: string;
  discoveryRunId: string;
  provider: string;
  query: string;
  requestStartedAt: Date;
  requestFinishedAt: Date | null;
  status: ProviderLogStatus;
  resultCount: number;
  estimatedCost: number;
  errorMessage: string | null;
  createdAt: Date;
};

/** One error encountered while executing a discovery run — kept even for retryable errors, so failure patterns are visible without digging through server logs. */
const DiscoveryErrorLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
    discoveryRunItemId: { type: String },
    searchQueueItemId: { type: String },
    searchQueryId: { type: String },
    /** Free text (e.g. "PROVIDER_ERROR", "TIMEOUT", "NOT_CONFIGURED") — open-ended, not a fixed vocabulary, since new failure modes shouldn't need a schema migration. */
    errorType: { type: String, required: true },
    errorMessage: { type: String, required: true },
    stackTrace: { type: String },
    retryable: { type: Boolean, default: false },
  },
  createdAtOnly,
);
DiscoveryErrorLogSchema.index({ workspaceId: 1, discoveryRunId: 1 });

export const DiscoveryErrorLog = models.DiscoveryErrorLog ?? model("DiscoveryErrorLog", DiscoveryErrorLogSchema);

export type DiscoveryErrorLog = {
  id: string;
  workspaceId: string;
  discoveryRunId: string;
  discoveryRunItemId: string | null;
  searchQueueItemId: string | null;
  searchQueryId: string | null;
  errorType: string;
  errorMessage: string;
  stackTrace: string | null;
  retryable: boolean;
  createdAt: Date;
};
