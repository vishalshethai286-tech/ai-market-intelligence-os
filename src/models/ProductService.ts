import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const ProductServiceSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    websiteAnalysisId: { type: String },
    name: { type: String, required: true },
    type: { type: String, enum: ["PRODUCT", "SERVICE"], default: "PRODUCT" },
    category: { type: String },
    subcategory: { type: String },
    description: { type: String },
    applications: { type: [String], default: [] },
    targetIndustries: { type: [String], default: [] },
    buyerTypes: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    synonyms: { type: [String], default: [] },
    relatedProductsServices: { type: [String], default: [] },
    projectKeywords: { type: [String], default: [] },
    tenderKeywords: { type: [String], default: [] },
    vendorRegistrationKeywords: { type: [String], default: [] },
    sourceUrls: { type: [String], default: [] },
    confidenceScore: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date },
    aiRawExtraction: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["PENDING_REVIEW", "APPROVED", "REJECTED"], default: "PENDING_REVIEW" },
    approvedAt: { type: Date },
    approvedByUserId: { type: String },
  },
  timestamps,
);
ProductServiceSchema.index({ workspaceId: 1, status: 1 });
ProductServiceSchema.index({ websiteAnalysisId: 1 });

export const ProductService = models.ProductService ?? model("ProductService", ProductServiceSchema);

export type ProductServiceType = "PRODUCT" | "SERVICE";
export type ProductServiceStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type ProductService = {
  id: string;
  workspaceId: string;
  websiteAnalysisId: string | null;
  name: string;
  type: ProductServiceType;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  applications: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  keywords: string[];
  synonyms: string[];
  relatedProductsServices: string[];
  projectKeywords: string[];
  tenderKeywords: string[];
  vendorRegistrationKeywords: string[];
  sourceUrls: string[];
  confidenceScore: number;
  lastVerifiedAt: Date | null;
  aiRawExtraction: unknown;
  status: ProductServiceStatus;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
