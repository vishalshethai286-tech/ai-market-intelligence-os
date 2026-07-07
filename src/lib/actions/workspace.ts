"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_WORKSPACE_COOKIE,
  createWorkspaceWithOwner,
  requireActiveWorkspace,
} from "@/lib/workspace";
import { canInviteMembers, canManageWorkspace } from "@/lib/access-control";
import {
  InviteMemberSchema,
  WorkspaceNameSchema,
  type InviteMemberFormState,
  type WorkspaceNameFormState,
} from "@/lib/validations/workspace";

const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export async function createWorkspace(
  _prevState: WorkspaceNameFormState,
  formData: FormData,
): Promise<WorkspaceNameFormState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const validatedFields = WorkspaceNameSchema.safeParse({
    name: formData.get("name"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const workspace = await prisma.$transaction(
    (tx) => createWorkspaceWithOwner(validatedFields.data.name, session.user.id, tx),
    { timeout: 15_000 },
  );

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  redirect("/onboarding");
}

/** Called directly from the workspace switcher (not a `<form>` submit). */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId, deletedAt: null },
  });
  if (!membership) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  revalidatePath("/dashboard", "layout");
}

export async function renameWorkspace(
  _prevState: WorkspaceNameFormState,
  formData: FormData,
): Promise<WorkspaceNameFormState> {
  const active = await requireActiveWorkspace();
  if (!canManageWorkspace(active.role)) {
    return { message: "Only owners and admins can rename the workspace." };
  }

  const validatedFields = WorkspaceNameSchema.safeParse({
    name: formData.get("name"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await prisma.workspace.update({
    where: { id: active.workspace.id },
    data: { name: validatedFields.data.name },
  });

  revalidatePath("/dashboard", "layout");
  return { message: "Workspace name updated." };
}

/**
 * Placeholder only — validates input and reports success, but does not
 * create an invite record or send an email yet.
 */
export async function inviteMember(
  _prevState: InviteMemberFormState,
  formData: FormData,
): Promise<InviteMemberFormState> {
  const active = await requireActiveWorkspace();
  if (!canInviteMembers(active.role)) {
    return { message: "Only owners and admins can invite members." };
  }

  const validatedFields = InviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  return {
    message: `Invite placeholder — ${validatedFields.data.email} would be invited as ${validatedFields.data.role}. No invite was sent yet.`,
  };
}
