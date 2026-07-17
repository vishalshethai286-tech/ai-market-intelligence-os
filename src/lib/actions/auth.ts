"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { dbConnect } from "@/lib/mongodb";
import { User, PasswordResetToken } from "@/models";
import { ACTIVE_WORKSPACE_COOKIE, createWorkspaceWithOwner } from "@/lib/workspace";
import { sendEmail } from "@/lib/email/service";
import { passwordResetEmail } from "@/lib/email/templates";
import {
  LoginSchema,
  SignupSchema,
  NewPasswordSchema,
  type LoginFormState,
  type SignupFormState,
} from "@/lib/validations/auth";

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function signup(
  _prevState: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const validatedFields = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const { name, email, password } = validatedFields.data;

  await dbConnect();
  const existing = await User.findOne({ email });
  if (existing) {
    return { errors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    // Not wrapped in a DB transaction — standalone MongoDB (no replica set)
    // doesn't support multi-document transactions. A crash between these two
    // writes would leave a user with no workspace; acceptable for an MVP,
    // worth revisiting (e.g. a replica set) once this matters in production.
    const user = await User.create({ name, email, passwordHash });
    await createWorkspaceWithOwner(`${name}'s Workspace`, user.id);
  } catch (error) {
    if (error instanceof Error && error.message.includes("OWNER role")) {
      return { message: "Server is not set up correctly (missing OWNER role). Run the seed script." };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Account created, but sign-in failed. Please log in." };
    }
    throw error;
  }
}

export async function login(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const validatedFields = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const { email, password } = validatedFields.data;

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Invalid email or password." };
    }
    throw error;
  }
}

export async function logout() {
  // The active-workspace cookie isn't tied to a session, so clear it here —
  // otherwise the next person to sign in on this browser could inherit
  // whichever workspace was last selected.
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  await signOut({ redirectTo: "/" });
}

const GENERIC_RESET_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

/**
 * Always returns the same generic message regardless of whether the email
 * is registered — confirming/denying an account's existence here would let
 * an attacker enumerate real user emails. Silently no-ops (still returns the
 * generic message) if the email isn't found or the account is deleted/has
 * no password (e.g. nothing to reset).
 */
export async function requestPasswordReset(
  _prevState: { message?: string } | undefined,
  formData: FormData,
): Promise<{ message?: string }> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) {
    return { message: "Please enter a valid email." };
  }

  await dbConnect();
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (user && !user.deletedAt && user.passwordHash) {
    const token = randomBytes(32).toString("hex");
    await PasswordResetToken.create({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
    try {
      await sendEmail({ to: user.email, ...passwordResetEmail(resetUrl) });
    } catch {
      // Don't let an email-provider hiccup reveal (via a different message) that the account exists.
    }
  }

  return { message: GENERIC_RESET_MESSAGE };
}

export type ResetPasswordFormState = { errors?: { password?: string[] }; message?: string } | undefined;

/**
 * Consumes a PasswordResetToken (single-use, 1-hour expiry) to set a new
 * password. Deliberately vague on failure ("invalid or expired") rather
 * than distinguishing "not found" from "expired" from "already used" — none
 * of those distinctions help a legitimate user and all of them help an
 * attacker probing tokens.
 */
export async function resetPassword(
  token: string,
  _prevState: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const validatedFields = NewPasswordSchema.safeParse({ password: formData.get("password") });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await dbConnect();
  const resetToken = await PasswordResetToken.findOne({ token });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { message: "That reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(validatedFields.data.password, 12);

  await User.updateOne({ _id: resetToken.userId }, { passwordHash });
  resetToken.usedAt = new Date();
  await resetToken.save();

  redirect("/login");
}
