import { Schema, models, model } from "mongoose";
import { idField, createdAtOnly } from "./shared";

const UsageLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true },
    userId: { type: String },
    metric: { type: String, required: true },
    quantity: { type: Schema.Types.Decimal128, default: "1" },
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: Date.now },
  },
  createdAtOnly,
);
UsageLogSchema.index({ workspaceId: 1, metric: 1, occurredAt: 1 });
UsageLogSchema.index({ userId: 1 });

export const UsageLog = models.UsageLog ?? model("UsageLog", UsageLogSchema);

export type UsageLog = {
  id: string;
  workspaceId: string;
  userId: string | null;
  metric: string;
  quantity: string;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
};

const ApiCostLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true },
    userId: { type: String },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    operation: { type: String },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costMicros: { type: Schema.Types.BigInt, default: 0 },
    currency: { type: String, default: "usd" },
    requestId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: Date.now },
  },
  createdAtOnly,
);
ApiCostLogSchema.index({ workspaceId: 1, occurredAt: 1 });
ApiCostLogSchema.index({ provider: 1, model: 1 });
ApiCostLogSchema.index({ userId: 1 });

export const ApiCostLog = models.ApiCostLog ?? model("ApiCostLog", ApiCostLogSchema);

export type ApiCostLog = {
  id: string;
  workspaceId: string;
  userId: string | null;
  provider: string;
  model: string;
  operation: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: bigint;
  currency: string;
  requestId: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
};

const AuditLogSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String },
    actorId: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  createdAtOnly,
);
AuditLogSchema.index({ workspaceId: 1, createdAt: 1 });
AuditLogSchema.index({ actorId: 1 });

export const AuditLog = models.AuditLog ?? model("AuditLog", AuditLogSchema);

export type AuditLog = {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};
