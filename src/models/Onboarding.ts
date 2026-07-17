import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const WorkspaceOnboardingSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, unique: true },
    companyWebsite: { type: String },
    workEmail: { type: String },
    targetCountries: { type: [String], default: [] },
    customerTypes: { type: [String], default: [] },
    status: { type: String, enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"], default: "NOT_STARTED", index: true },
    currentStep: { type: Number, default: 1 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  timestamps,
);

export const WorkspaceOnboarding = models.WorkspaceOnboarding ?? model("WorkspaceOnboarding", WorkspaceOnboardingSchema);

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type WorkspaceOnboarding = {
  id: string;
  workspaceId: string;
  companyWebsite: string | null;
  workEmail: string | null;
  targetCountries: string[];
  customerTypes: string[];
  status: OnboardingStatus;
  currentStep: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
