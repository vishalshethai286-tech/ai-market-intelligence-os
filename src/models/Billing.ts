import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const PlanSchema = new Schema(
  {
    ...idField,
    key: {
      type: String,
      required: true,
      unique: true,
      enum: ["FREE_TRIAL", "STARTER", "PROFESSIONAL", "BUSINESS", "GROWTH", "ENTERPRISE"],
    },
    name: { type: String, required: true },
    description: { type: String },
    priceCents: { type: Number, default: 0 },
    currency: { type: String, default: "usd" },
    billingInterval: { type: String, enum: ["MONTHLY", "YEARLY"], default: "MONTHLY" },
    trialDays: { type: Number, default: 0 },
    stripePriceId: { type: String },
    maxSeats: { type: Number },
    maxWorkspaces: { type: Number },
    usageLimits: { type: Schema.Types.Mixed, default: {} },
    features: { type: [Schema.Types.Mixed], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date },
  },
  timestamps,
);

export const Plan = models.Plan ?? model("Plan", PlanSchema);

export type PlanKey = "FREE_TRIAL" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "GROWTH" | "ENTERPRISE";
export type BillingInterval = "MONTHLY" | "YEARLY";

export type Plan = {
  id: string;
  key: PlanKey;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  trialDays: number;
  stripePriceId: string | null;
  maxSeats: number | null;
  maxWorkspaces: number | null;
  usageLimits: Record<string, unknown>;
  features: unknown[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const SubscriptionSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, unique: true },
    planId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "INCOMPLETE"],
      default: "TRIALING",
      index: true,
    },
    seats: { type: Number, default: 1 },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    trialEndsAt: { type: Date },
    cancelAt: { type: Date },
    canceledAt: { type: Date },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    deletedAt: { type: Date },
  },
  timestamps,
);

export const Subscription = models.Subscription ?? model("Subscription", SubscriptionSchema);

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "INCOMPLETE";

export type Subscription = {
  id: string;
  workspaceId: string;
  planId: string;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAt: Date | null;
  canceledAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
