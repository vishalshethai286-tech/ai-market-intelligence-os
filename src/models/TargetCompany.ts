import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const TargetCompanySchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    companyName: { type: String, required: true },
    website: { type: String },
    country: { type: String },
    cityState: { type: String },
    industry: { type: String },
    companyDescription: { type: String },
    buyerType: { type: String },
    matchedProduct: { type: String },
    sourceUrl: { type: String },
    relevanceExplanation: { type: String },
    confidenceScore: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 },
    priorityGrade: { type: String, enum: ["A_PLUS", "A", "B", "C"] },
    status: { type: String, enum: ["PENDING_REVIEW", "APPROVED", "REJECTED"], default: "PENDING_REVIEW", index: true },
    duplicateStatus: {
      type: String,
      enum: ["UNIQUE", "DUPLICATE", "POSSIBLE_DUPLICATE"],
      default: "UNIQUE",
    },
    lastVerifiedAt: { type: Date },
  },
  timestamps,
);
TargetCompanySchema.index({ workspaceId: 1, priorityGrade: 1 });
TargetCompanySchema.index({ workspaceId: 1, createdAt: 1 });

export const TargetCompany = models.TargetCompany ?? model("TargetCompany", TargetCompanySchema);

export type TargetCompanyStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type TargetCompanyDuplicateStatus = "UNIQUE" | "DUPLICATE" | "POSSIBLE_DUPLICATE";
export type TargetCompanyPriorityGrade = "A_PLUS" | "A" | "B" | "C";

export type TargetCompany = {
  id: string;
  workspaceId: string;
  companyName: string;
  website: string | null;
  country: string | null;
  cityState: string | null;
  industry: string | null;
  companyDescription: string | null;
  buyerType: string | null;
  matchedProduct: string | null;
  sourceUrl: string | null;
  relevanceExplanation: string | null;
  confidenceScore: number;
  priorityScore: number;
  priorityGrade: TargetCompanyPriorityGrade | null;
  status: TargetCompanyStatus;
  duplicateStatus: TargetCompanyDuplicateStatus;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
