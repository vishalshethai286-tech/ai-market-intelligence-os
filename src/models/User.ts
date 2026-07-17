import { Schema, models, model } from "mongoose";
import { idField, timestamps, createdAtOnly } from "./shared";

const UserSchema = new Schema(
  {
    ...idField,
    email: { type: String, required: true, unique: true },
    name: { type: String },
    passwordHash: { type: String },
    avatarUrl: { type: String },
    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, index: true },
  },
  timestamps,
);

export const User = models.User ?? model("User", UserSchema);

export type User = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const PasswordResetTokenSchema = new Schema(
  {
    ...idField,
    userId: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  createdAtOnly,
);

export const PasswordResetToken = models.PasswordResetToken ?? model("PasswordResetToken", PasswordResetTokenSchema);

export type PasswordResetToken = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};
