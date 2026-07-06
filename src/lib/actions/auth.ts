"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uniqueWorkspaceSlug } from "@/lib/slug";
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

  const ownerRole = await prisma.role.findUnique({ where: { key: "OWNER" } });
  if (!ownerRole) {
    return { message: "Server is not set up correctly (missing OWNER role). Run the seed script." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const workspaceSlug = await uniqueWorkspaceSlug(`${name}'s Workspace`);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash },
    });

    const workspace = await tx.workspace.create({
      data: { name: `${name}'s Workspace`, slug: workspaceSlug },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
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
