import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly } from "./shared";

const WebsiteAnalysisSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"], default: "PENDING", index: true },
    error: { type: String },
    httpStatus: { type: Number },
    robotsAllowed: { type: Boolean },
    title: { type: String },
    metaDescription: { type: String },
    headings: { type: Schema.Types.Mixed },
    visibleText: { type: String },
    internalLinks: { type: Schema.Types.Mixed },
    identifiedPages: { type: Schema.Types.Mixed },
    rawResult: { type: Schema.Types.Mixed },
    fetchedAt: { type: Date },
  },
  timestamps,
);
WebsiteAnalysisSchema.index({ workspaceId: 1, createdAt: 1 });

export const WebsiteAnalysis = models.WebsiteAnalysis ?? model("WebsiteAnalysis", WebsiteAnalysisSchema);

export type WebsiteAnalysisStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type WebsiteAnalysis = {
  id: string;
  workspaceId: string;
  url: string;
  status: WebsiteAnalysisStatus;
  error: string | null;
  httpStatus: number | null;
  robotsAllowed: boolean | null;
  title: string | null;
  metaDescription: string | null;
  headings: unknown;
  visibleText: string | null;
  internalLinks: unknown;
  identifiedPages: unknown;
  rawResult: unknown;
  fetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const WebsitePageSnapshotSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    websiteAnalysisId: { type: String, required: true },
    url: { type: String, required: true },
    category: { type: String },
    title: { type: String },
    visibleText: { type: String },
    httpStatus: { type: Number },
    fetchedAt: { type: Date, default: Date.now },
  },
  createdAtOnly,
);
WebsitePageSnapshotSchema.index({ websiteAnalysisId: 1, url: 1 }, { unique: true });

export const WebsitePageSnapshot = models.WebsitePageSnapshot ?? model("WebsitePageSnapshot", WebsitePageSnapshotSchema);

export type WebsitePageSnapshot = {
  id: string;
  workspaceId: string;
  websiteAnalysisId: string;
  url: string;
  category: string | null;
  title: string | null;
  visibleText: string | null;
  httpStatus: number | null;
  fetchedAt: Date;
  createdAt: Date;
};
