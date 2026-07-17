"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { dbConnect } from "@/lib/mongodb";
import { Workspace, Role, User, WorkspaceMember, WorkspaceInvite } from "@/models";
import {
  ACTIVE_WORKSPACE_COOKIE,
  createWorkspaceWithOwner,
  requireActiveWorkspace,
} from "@/lib/workspace";
import { canInviteMembers, canManageWorkspace } from "@/lib/access-control";
import { sendEmail } from "@/lib/email/service";
import { workspaceInviteEmail } from "@/lib/email/templates";
import {
  InviteMemberSchema,
  WorkspaceNameSchema,
  type InviteMemberFormState,
  type WorkspaceNameFormState,
} from "@/lib/validations/workspace";

const WORKSPACE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  const workspace = await createWorkspaceWithOwner(validatedFields.data.name, session.user.id);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  redirect("/onboarding");
}

/** Called directly from the workspace switcher (not a `<form>` submit). */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await dbConnect();
  const membership = await WorkspaceMember.findOne({
    userId: session.user.id,
    workspaceId,
    deletedAt: null,
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

  await dbConnect();
  await Workspace.updateOne({ _id: active.workspace.id }, { name: validatedFields.data.name });

  revalidatePath("/dashboard", "layout");
  return { message: "Workspace name updated." };
}

/**
 * Creates a WorkspaceInvite (separate from WorkspaceMember, since the
 * invitee may not have an account yet — see the model's doc comment) and
 * emails an accept link. Any prior PENDING invite for the same email in this
 * workspace is revoked first, so only one link is ever valid at a time.
 */
export async function inviteMember(
  _prevState: InviteMemberFormState,
  formData: FormData,
): Promise<InviteMemberFormState> {
  const active = await requireActiveWorkspace();
  const session = await auth();
  if (!session?.user) redirect("/login");

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

  const { email, role: roleKey } = validatedFields.data;

  await dbConnect();
  const [role, existingUser] = await Promise.all([Role.findOne({ key: roleKey }), User.findOne({ email })]);
  if (!role) {
    throw new Error(`Missing role "${roleKey}" — run the seed script.`);
  }

  if (existingUser) {
    const existingMembership = await WorkspaceMember.findOne({
      workspaceId: active.workspace.id,
      userId: existingUser.id,
    });
    if (existingMembership && !existingMembership.deletedAt) {
      return { message: `${email} is already a member of this workspace.` };
    }
  }

  await WorkspaceInvite.updateMany(
    { workspaceId: active.workspace.id, email, status: "PENDING" },
    { status: "REVOKED" },
  );

  const token = randomBytes(32).toString("hex");
  await WorkspaceInvite.create({
    workspaceId: active.workspace.id,
    email,
    roleId: role.id,
    token,
    invitedByUserId: session.user.id,
    expiresAt: new Date(Date.now() + WORKSPACE_INVITE_TTL_MS),
  });

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  const inviterName = session.user.name || session.user.email || "A teammate";

  try {
    await sendEmail({ to: email, ...workspaceInviteEmail(active.workspace.name, inviterName, acceptUrl) });
  } catch {
    return {
      message: `Invite created, but the email couldn't be sent right now. Share this link with ${email} directly: ${acceptUrl}`,
    };
  }

  revalidatePath("/dashboard/settings");
  return { message: `Invite sent to ${email}.` };
}

export type AcceptInviteResult = { error: string } | undefined;

/**
 * Consumes a WorkspaceInvite: the signed-in user must be signed in with the
 * exact email the invite was sent to (prevents a leaked link being claimed
 * by someone else's account), and the invite must still be PENDING and
 * unexpired. The upsert handles both "brand new member" and "rejoining after
 * being removed" (a soft-deleted WorkspaceMember row) in one call.
 */
export async function acceptWorkspaceInvite(token: string): Promise<AcceptInviteResult> {
  const session = await auth();
  if (!session?.user) redirect(`/login`);

  await dbConnect();
  const invite = await WorkspaceInvite.findOne({ token });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { error: "This invite is invalid or has expired." };
  }

  if (invite.email.toLowerCase() !== session.user.email?.toLowerCase()) {
    return { error: `This invite was sent to ${invite.email}. Log in with that email to accept it.` };
  }

  await WorkspaceMember.findOneAndUpdate(
    { workspaceId: invite.workspaceId, userId: session.user.id },
    { $set: { roleId: invite.roleId, status: "ACTIVE", deletedAt: null, joinedAt: new Date() } },
    { upsert: true },
  );
  invite.status = "ACCEPTED";
  invite.acceptedAt = new Date();
  await invite.save();

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, invite.workspaceId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  redirect("/dashboard");
}
