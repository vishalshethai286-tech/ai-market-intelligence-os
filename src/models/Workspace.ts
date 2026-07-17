import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

const WorkspaceSchema = new Schema(
  {
    ...idField,
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    logoUrl: { type: String },
    deletedAt: { type: Date, index: true },
  },
  timestamps,
);

export const Workspace = models.Workspace ?? model("Workspace", WorkspaceSchema);

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const RoleSchema = new Schema(
  {
    ...idField,
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    permissions: { type: [Schema.Types.Mixed], default: [] },
    isSystem: { type: Boolean, default: true },
  },
  timestamps,
);

export const Role = models.Role ?? model("Role", RoleSchema);

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: unknown[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const WorkspaceMemberSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    status: { type: String, enum: ["INVITED", "ACTIVE", "SUSPENDED"], default: "INVITED" },
    invitedAt: { type: Date },
    joinedAt: { type: Date },
    deletedAt: { type: Date, index: true },
  },
  timestamps,
);
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMember = models.WorkspaceMember ?? model("WorkspaceMember", WorkspaceMemberSchema);

export type WorkspaceMemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  status: WorkspaceMemberStatus;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const WorkspaceInviteSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    invitedByUserId: { type: String },
    status: { type: String, enum: ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"], default: "PENDING" },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
  },
  timestamps,
);

export const WorkspaceInvite = models.WorkspaceInvite ?? model("WorkspaceInvite", WorkspaceInviteSchema);

export type WorkspaceInviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  roleId: string;
  token: string;
  invitedByUserId: string | null;
  status: WorkspaceInviteStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
