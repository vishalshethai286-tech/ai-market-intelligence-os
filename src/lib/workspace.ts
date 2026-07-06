import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uniqueWorkspaceSlug } from "@/lib/slug";
import type { Prisma } from "@/generated/prisma/client";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export type MembershipWithWorkspaceAndRole = Awaited<ReturnType<typeof listMemberships>>[number];

export type ActiveWorkspace = {
  membershipId: string;
  role: string;
  workspace: { id: string; name: string; slug: string };
};

/** All non-removed workspace memberships for a user, oldest first. */
export async function listMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { workspace: true, role: true },
  });
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
 * "create workspace". Pass a transaction client to compose this into a
 * larger transaction (e.g. alongside creating the User itself).
 */
export async function createWorkspaceWithOwner(
  name: string,
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const ownerRole = await client.role.findUnique({ where: { key: "OWNER" } });
  if (!ownerRole) {
    throw new Error("Missing OWNER role — run `npx prisma db seed`.");
  }

  const slug = await uniqueWorkspaceSlug(name, client);

  const workspace = await client.workspace.create({ data: { name, slug } });
  await client.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId,
      roleId: ownerRole.id,
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });
  return workspace;
}
