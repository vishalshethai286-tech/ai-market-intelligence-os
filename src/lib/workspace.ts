import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { dbConnect } from "@/lib/mongodb";
import { Workspace, WorkspaceMember, Role, User, Plan, Subscription } from "@/models";
import type { Workspace as WorkspaceType, WorkspaceMember as WorkspaceMemberType, Role as RoleType } from "@/models";
import { uniqueWorkspaceSlug } from "@/lib/slug";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export type MembershipWithWorkspaceAndRole = WorkspaceMemberType & {
  workspace: WorkspaceType;
  role: RoleType;
};

export type ActiveWorkspace = {
  membershipId: string;
  role: string;
  workspace: { id: string; name: string; slug: string };
};

/** All non-removed workspace memberships for a user, oldest first. */
export async function listMemberships(userId: string): Promise<MembershipWithWorkspaceAndRole[]> {
  await dbConnect();
  const members = await WorkspaceMember.find({ userId, deletedAt: null }).sort({ createdAt: 1 });
  if (members.length === 0) return [];

  const workspaceIds = members.map((m) => m.workspaceId);
  const roleIds = members.map((m) => m.roleId);
  const [workspaces, roles] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } }),
    Role.find({ _id: { $in: roleIds } }),
  ]);
  const workspaceById = new Map(workspaces.map((w) => [w.id, w.toObject() as WorkspaceType]));
  const roleById = new Map(roles.map((r) => [r.id, r.toObject() as RoleType]));

  return members.map((m) => ({
    ...(m.toObject() as WorkspaceMemberType),
    workspace: workspaceById.get(m.workspaceId)!,
    role: roleById.get(m.roleId)!,
  }));
}

export type AssignableWorkspaceMember = { userId: string; email: string; name: string | null };

/** Active (non-removed, non-invited-only) members of a workspace, for populating an "Assign to"/"Owner" dropdown — e.g. Contact ownership, ContactTask assignment. */
export async function listActiveWorkspaceMembers(workspaceId: string): Promise<AssignableWorkspaceMember[]> {
  await dbConnect();
  const members = await WorkspaceMember.find({ workspaceId, deletedAt: null, status: "ACTIVE" }).sort({ createdAt: 1 });
  if (members.length === 0) return [];

  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } });
  const userById = new Map(users.map((u) => [u.id, u]));

  const result: AssignableWorkspaceMember[] = [];
  for (const m of members) {
    const user = userById.get(m.userId);
    if (!user) continue;
    const name: string | null = user.name ?? null;
    result.push({ userId: user.id as string, email: user.email as string, name });
  }
  return result;
}

/**
 * Resolves session + memberships + the `active_workspace` cookie in one
 * pass, so the dashboard layout (which needs the full membership list for
 * the workspace switcher) and pages that only need the active workspace
 * can share a single source of truth.
 */
export async function getWorkspaceContext(): Promise<{
  memberships: MembershipWithWorkspaceAndRole[];
  active: ActiveWorkspace | null;
} | null> {
  const session = await auth();
  if (!session?.user) return null;

  const memberships = await listMemberships(session.user.id);
  if (memberships.length === 0) return { memberships, active: null };

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const chosen = memberships.find((m) => m.workspaceId === activeId) ?? memberships[0];

  return {
    memberships,
    active: {
      membershipId: chosen.id,
      role: chosen.role.key,
      workspace: chosen.workspace,
    },
  };
}

export async function getActiveWorkspace(): Promise<ActiveWorkspace | null> {
  const context = await getWorkspaceContext();
  return context?.active ?? null;
}

/** Redirects to workspace creation if the user has no workspace yet. */
export async function requireActiveWorkspace(): Promise<ActiveWorkspace> {
  const active = await getActiveWorkspace();
  if (!active) redirect("/dashboard/workspaces/new");
  return active;
}

/**
 * Creates a Workspace and makes `userId` its OWNER. Shared by signup and
 * "create workspace". Not wrapped in a DB transaction — standalone MongoDB
 * (no replica set) doesn't support multi-document transactions; acceptable
 * for an MVP, worth revisiting once this matters in production.
 */
export async function createWorkspaceWithOwner(name: string, userId: string) {
  await dbConnect();
  // Role and Plan lookups are independent of each other and of the slug —
  // run them together rather than as 5 sequential round trips (matters on a
  // real remote MongoDB instance, where each round trip has real latency).
  const [ownerRole, freeTrialPlan, slug] = await Promise.all([
    Role.findOne({ key: "OWNER" }),
    Plan.findOne({ key: "FREE_TRIAL", isActive: true }),
    uniqueWorkspaceSlug(name),
  ]);
  if (!ownerRole) {
    throw new Error("Missing OWNER role — run `npm run seed`.");
  }

  const workspace = await Workspace.create({ name, slug });

  // Every new workspace starts on a mock (no Stripe object) trial subscription
  // so billing/usage-limit checks always have a Plan to compare against —
  // skipped (not an error) if the seed script hasn't run yet in this
  // environment, same graceful-degradation convention as every other
  // optional-integration lookup in this app.
  const now = new Date();
  await Promise.all([
    WorkspaceMember.create({
      workspaceId: workspace.id,
      userId,
      roleId: ownerRole.id,
      status: "ACTIVE",
      joinedAt: new Date(),
    }),
    freeTrialPlan
      ? Subscription.create({
          workspaceId: workspace.id,
          planId: freeTrialPlan.id,
          status: "TRIALING",
          billingProvider: "MOCK",
          trialEndsAt: new Date(now.getTime() + (freeTrialPlan.trialDays as number) * 24 * 60 * 60 * 1000),
          currentPeriodStart: now,
        })
      : null,
  ]);

  return workspace;
}
