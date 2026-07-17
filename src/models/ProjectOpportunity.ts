import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

/** One entry per raw result that contributed to or re-confirmed this project — same shape/purpose as TargetCustomer's embedded source list (Phase 7), applied to projects. */
const ProjectSourceHistoryEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    rawSearchResultId: { type: String, required: true },
    discoveryRunId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * A structured project opportunity extracted from a Phase 6 RawSearchResult
 * (searchType=PROJECT) — the Phase 9 counterpart to TargetCustomer (Phase
 * 7), reusing the same Discovery Brain → Search Execution → extraction →
 * scoring → dedup shape.
 */
const ProjectOpportunitySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    clientName: { type: String, required: true, index: true },
    projectName: { type: String, required: true, index: true },
    location: { type: String, index: true },
    country: { type: String, index: true },
    contractorName: { type: String, index: true },
    timeline: { type: String },
    projectInformationLink: { type: String },
    industry: { type: String },
    matchedProductServiceId: { type: String },
    matchedProductServiceName: { type: String },
    projectStage: {
      type: String,
      enum: ["ANNOUNCED", "PLANNING", "FEED", "TENDER", "AWARDED", "CONSTRUCTION", "OPERATIONAL", "UNKNOWN"],
      default: "UNKNOWN",
      index: true,
    },
    score: { type: Number, default: 0, index: true },
    priority: { type: String, enum: ["A_PLUS", "A", "B", "C"], index: true },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"],
      default: "NEW",
      index: true,
    },
    sourceUrl: { type: String },
    sourceHistory: { type: [ProjectSourceHistoryEntrySchema], default: [] },
    aiOpportunityExplanation: { type: String },
    confidenceScore: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date, index: true },
    duplicateStatus: {
      type: String,
      enum: ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"],
      default: "UNIQUE",
    },
    duplicateKey: { type: String, index: true },
    rawSearchResultId: { type: String, required: true, index: true },
    discoveryRunId: { type: String, required: true, index: true },
  },
  timestamps,
);
ProjectOpportunitySchema.index({ workspaceId: 1, createdAt: -1 });
ProjectOpportunitySchema.index({ workspaceId: 1, duplicateKey: 1 });
ProjectOpportunitySchema.index({ workspaceId: 1, country: 1 });
ProjectOpportunitySchema.index({ workspaceId: 1, projectStage: 1 });

export const ProjectOpportunity = models.ProjectOpportunity ?? model("ProjectOpportunity", ProjectOpportunitySchema);

export type ProjectStage = "ANNOUNCED" | "PLANNING" | "FEED" | "TENDER" | "AWARDED" | "CONSTRUCTION" | "OPERATIONAL" | "UNKNOWN";
export type ProjectOpportunityStatus = "NEW" | "REVIEWED" | "APPROVED" | "REJECTED" | "WATCHING" | "CONTACTED" | "ARCHIVED";
export type ProjectOpportunityPriority = "A_PLUS" | "A" | "B" | "C";
export type ProjectOpportunityDuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE" | "DUPLICATE" | "MERGED" | "REJECTED";

export type ProjectSourceHistoryEntry = {
  url: string;
  rawSearchResultId: string;
  discoveryRunId: string;
  retrievedAt: Date;
};

export type ProjectOpportunity = {
  id: string;
  workspaceId: string;
  clientName: string;
  projectName: string;
  location: string | null;
  country: string | null;
  contractorName: string | null;
  timeline: string | null;
  projectInformationLink: string | null;
  industry: string | null;
  matchedProductServiceId: string | null;
  matchedProductServiceName: string | null;
  projectStage: ProjectStage;
  score: number;
  priority: ProjectOpportunityPriority | null;
  status: ProjectOpportunityStatus;
  sourceUrl: string | null;
  sourceHistory: ProjectSourceHistoryEntry[];
  aiOpportunityExplanation: string | null;
  confidenceScore: number;
  lastVerifiedAt: Date | null;
  duplicateStatus: ProjectOpportunityDuplicateStatus;
  duplicateKey: string | null;
  rawSearchResultId: string;
  discoveryRunId: string;
  createdAt: Date;
  updatedAt: Date;
};
