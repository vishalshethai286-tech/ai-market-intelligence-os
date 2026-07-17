import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const CompanyProfileSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, unique: true },
    websiteAnalysisId: { type: String },
    website: { type: String },
    workEmail: { type: String },
    targetCountries: { type: [String], default: [] },
    preferredCustomerTypes: { type: [String], default: [] },
    companyName: { type: String },
    businessDescription: { type: String },
    industry: { type: String },
    businessModel: { type: String },
    countriesServed: { type: [String], default: [] },
    headquarters: { type: String },
    operationType: {
      type: String,
      enum: ["MANUFACTURER", "TRADER", "SERVICE_PROVIDER", "OTHER", "UNKNOWN"],
      default: "UNKNOWN",
    },
    certifications: { type: [String], default: [] },
    keyProductsServices: { type: [String], default: [] },
    confidenceScore: { type: Number, default: 0 },
    sourceUrls: { type: [String], default: [] },
    aiRawExtraction: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["PENDING_REVIEW", "APPROVED"], default: "PENDING_REVIEW", index: true },
    approvedAt: { type: Date },
    approvedByUserId: { type: String },
  },
  timestamps,
);
CompanyProfileSchema.index({ websiteAnalysisId: 1 });

export const CompanyProfile = models.CompanyProfile ?? model("CompanyProfile", CompanyProfileSchema);

export type CompanyProfileStatus = "PENDING_REVIEW" | "APPROVED";
export type CompanyOperationType = "MANUFACTURER" | "TRADER" | "SERVICE_PROVIDER" | "OTHER" | "UNKNOWN";

export type CompanyProfile = {
  id: string;
  workspaceId: string;
  websiteAnalysisId: string | null;
  website: string | null;
  workEmail: string | null;
  targetCountries: string[];
  preferredCustomerTypes: string[];
  companyName: string | null;
  businessDescription: string | null;
  industry: string | null;
  businessModel: string | null;
  countriesServed: string[];
  headquarters: string | null;
  operationType: CompanyOperationType;
  certifications: string[];
  keyProductsServices: string[];
  confidenceScore: number;
  sourceUrls: string[];
  aiRawExtraction: unknown;
  status: CompanyProfileStatus;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
