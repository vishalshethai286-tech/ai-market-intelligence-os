import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly } from "./shared";

const BusinessBrainSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["INITIALIZING", "ACTIVE", "STALE"], default: "INITIALIZING", index: true },
    lastUpdatedAt: { type: Date },
  },
  timestamps,
);

export const BusinessBrain = models.BusinessBrain ?? model("BusinessBrain", BusinessBrainSchema);

export type BusinessBrainStatus = "INITIALIZING" | "ACTIVE" | "STALE";

export type BusinessBrain = {
  id: string;
  workspaceId: string;
  status: BusinessBrainStatus;
  lastUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const BrainSourceSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    websiteAnalysisId: { type: String },
    sourceType: {
      type: String,
      enum: ["WEBSITE_PAGE", "DOCUMENT", "MANUAL_ENTRY", "THIRD_PARTY_API", "OTHER"],
      default: "WEBSITE_PAGE",
    },
    url: { type: String },
    title: { type: String },
    fetchedAt: { type: Date },
  },
  timestamps,
);
BrainSourceSchema.index({ websiteAnalysisId: 1 });

export const BrainSource = models.BrainSource ?? model("BrainSource", BrainSourceSchema);

export type BrainSourceType = "WEBSITE_PAGE" | "DOCUMENT" | "MANUAL_ENTRY" | "THIRD_PARTY_API" | "OTHER";

export type BrainSource = {
  id: string;
  workspaceId: string;
  brainId: string;
  websiteAnalysisId: string | null;
  sourceType: BrainSourceType;
  url: string | null;
  title: string | null;
  fetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const BrainEntitySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ["ORGANIZATION", "PERSON", "PRODUCT", "LOCATION", "CERTIFICATION", "INDUSTRY", "BUYING_SIGNAL", "OTHER"],
      default: "OTHER",
    },
    name: { type: String, required: true },
    description: { type: String },
    confidenceScore: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  timestamps,
);
BrainEntitySchema.index({ workspaceId: 1, entityType: 1 });

export const BrainEntity = models.BrainEntity ?? model("BrainEntity", BrainEntitySchema);

export type BrainEntityType =
  | "ORGANIZATION"
  | "PERSON"
  | "PRODUCT"
  | "LOCATION"
  | "CERTIFICATION"
  | "INDUSTRY"
  | "BUYING_SIGNAL"
  | "OTHER";

export type BrainEntity = {
  id: string;
  workspaceId: string;
  brainId: string;
  entityType: BrainEntityType;
  name: string;
  description: string | null;
  confidenceScore: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const BrainRelationshipSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    sourceId: { type: String },
    fromEntityId: { type: String, required: true, index: true },
    toEntityId: { type: String, required: true, index: true },
    relationshipType: { type: String, required: true },
    confidenceScore: { type: Number, default: 0 },
  },
  timestamps,
);

export const BrainRelationship = models.BrainRelationship ?? model("BrainRelationship", BrainRelationshipSchema);

export type BrainRelationship = {
  id: string;
  workspaceId: string;
  brainId: string;
  sourceId: string | null;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  confidenceScore: number;
  createdAt: Date;
  updatedAt: Date;
};

const BrainFactSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    sourceId: { type: String, index: true },
    entityId: { type: String, index: true },
    factType: {
      type: String,
      required: true,
      enum: [
        "COMPANY_NAME",
        "BUSINESS_DESCRIPTION",
        "INDUSTRY",
        "BUSINESS_MODEL",
        "HEADQUARTERS",
        "COUNTRY_SERVED",
        "OPERATION_TYPE",
        "CERTIFICATION",
        "PRODUCT_OR_SERVICE",
        "TARGET_INDUSTRY",
        "BUYER_TYPE",
        "KEYWORD",
        "APPLICATION",
        "PROJECT_KEYWORD",
        "TENDER_KEYWORD",
        "VENDOR_REGISTRATION_KEYWORD",
        "BUYING_SIGNAL",
        "CONTACT_INFO",
        "FINANCIAL",
        "LEADERSHIP",
        "COMPETITOR",
        "OTHER",
      ],
    },
    factValue: { type: String, required: true },
    sourceUrl: { type: String },
    confidenceScore: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date },
    freshnessScore: { type: Number, default: 1 },
    verificationStatus: {
      type: String,
      enum: ["UNVERIFIED", "CORRECT", "INCORRECT", "NEEDS_REVIEW"],
      default: "UNVERIFIED",
    },
    verifiedByUserId: { type: String },
    pendingFactValue: { type: String },
  },
  timestamps,
);
BrainFactSchema.index({ workspaceId: 1, factType: 1 });

export const BrainFact = models.BrainFact ?? model("BrainFact", BrainFactSchema);

export type BrainFactType =
  | "COMPANY_NAME"
  | "BUSINESS_DESCRIPTION"
  | "INDUSTRY"
  | "BUSINESS_MODEL"
  | "HEADQUARTERS"
  | "COUNTRY_SERVED"
  | "OPERATION_TYPE"
  | "CERTIFICATION"
  | "PRODUCT_OR_SERVICE"
  | "TARGET_INDUSTRY"
  | "BUYER_TYPE"
  | "KEYWORD"
  | "APPLICATION"
  | "PROJECT_KEYWORD"
  | "TENDER_KEYWORD"
  | "VENDOR_REGISTRATION_KEYWORD"
  | "BUYING_SIGNAL"
  | "CONTACT_INFO"
  | "FINANCIAL"
  | "LEADERSHIP"
  | "COMPETITOR"
  | "OTHER";

export type BrainFactVerificationStatus = "UNVERIFIED" | "CORRECT" | "INCORRECT" | "NEEDS_REVIEW";

export type BrainFact = {
  id: string;
  workspaceId: string;
  brainId: string;
  sourceId: string | null;
  entityId: string | null;
  factType: BrainFactType;
  factValue: string;
  sourceUrl: string | null;
  confidenceScore: number;
  lastVerifiedAt: Date | null;
  freshnessScore: number;
  verificationStatus: BrainFactVerificationStatus;
  verifiedByUserId: string | null;
  pendingFactValue: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const BrainUpdateRunSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    status: { type: String, enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"], default: "PENDING", index: true },
    trigger: { type: String, enum: ["ONBOARDING", "MANUAL", "SCHEDULED", "WEBSITE_ANALYSIS"], default: "MANUAL" },
    factsCreated: { type: Number, default: 0 },
    factsUpdated: { type: Number, default: 0 },
    factsExpired: { type: Number, default: 0 },
    factsFlagged: { type: Number, default: 0 },
    error: { type: String },
    triggeredByUserId: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  timestamps,
);
BrainUpdateRunSchema.index({ workspaceId: 1, createdAt: 1 });

export const BrainUpdateRun = models.BrainUpdateRun ?? model("BrainUpdateRun", BrainUpdateRunSchema);

export type BrainUpdateRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type BrainUpdateTrigger = "ONBOARDING" | "MANUAL" | "SCHEDULED" | "WEBSITE_ANALYSIS";

export type BrainUpdateRun = {
  id: string;
  workspaceId: string;
  brainId: string;
  status: BrainUpdateRunStatus;
  trigger: BrainUpdateTrigger;
  factsCreated: number;
  factsUpdated: number;
  factsExpired: number;
  factsFlagged: number;
  error: string | null;
  triggeredByUserId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const BrainFeedbackSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    brainId: { type: String, required: true, index: true },
    feedbackType: {
      type: String,
      required: true,
      enum: ["GOOD_LEAD", "BAD_LEAD", "CORRECT_PRODUCT", "INCORRECT_PRODUCT", "GOOD_INDUSTRY", "BAD_INDUSTRY"],
    },
    entityId: { type: String, index: true },
    factId: { type: String, index: true },
    subjectLabel: { type: String },
    note: { type: String },
    userId: { type: String, required: true },
  },
  createdAtOnly,
);
BrainFeedbackSchema.index({ workspaceId: 1, feedbackType: 1 });

export const BrainFeedback = models.BrainFeedback ?? model("BrainFeedback", BrainFeedbackSchema);

export type BrainFeedbackType =
  | "GOOD_LEAD"
  | "BAD_LEAD"
  | "CORRECT_PRODUCT"
  | "INCORRECT_PRODUCT"
  | "GOOD_INDUSTRY"
  | "BAD_INDUSTRY";

export type BrainFeedback = {
  id: string;
  workspaceId: string;
  brainId: string;
  feedbackType: BrainFeedbackType;
  entityId: string | null;
  factId: string | null;
  subjectLabel: string | null;
  note: string | null;
  userId: string;
  createdAt: Date;
};
