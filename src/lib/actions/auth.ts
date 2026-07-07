"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_WORKSPACE_COOKIE, createWorkspaceWithOwner } from "@/lib/workspace";
import {
  LoginSchema,
  SignupSchema,
  type LoginFormState,
  type SignupFormState,
} from "@/lib/validations/auth";

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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: { name, email, passwordHash },
        });
        await createWorkspaceWithOwner(`${name}'s Workspace`, user.id, tx);
      },
      // Default 5s timeout is tight for a 3-write onboarding transaction; give it headroom.
      { timeout: 15_000 },
    );
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

/**
 * Placeholder only — does not send an email or touch the database yet.
 * Wire this up to a real email provider before shipping password reset.
 */
export async function requestPasswordReset(
  _prevState: { message?: string } | undefined,
  formData: FormData,
): Promise<{ message?: string }> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) {
    return { message: "Please enter a valid email." };
  }

  return {
    message: "If an account exists for that email, we've sent a password reset link.",
  };
}
