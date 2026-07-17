import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { WorkspaceMember, User, Role } from "@/models";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canInviteMembers, canManageWorkspace } from "@/lib/access-control";
import { RenameWorkspaceForm } from "./rename-workspace-form";
import { InviteMemberForm } from "./invite-member-form";
import { MembersTable } from "./members-table";

export const metadata: Metadata = {
  title: "Workspace settings",
};

export default async function SettingsPage() {
  const active = await requireActiveWorkspace();

  await dbConnect();
  const memberRows = await WorkspaceMember.find({ workspaceId: active.workspace.id, deletedAt: null }).sort({
    createdAt: 1,
  });
  const [users, roles] = await Promise.all([
    User.find({ _id: { $in: memberRows.map((m) => m.userId) } }),
    Role.find({ _id: { $in: memberRows.map((m) => m.roleId) } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const members = memberRows.map((m) => ({
    id: m.id,
    status: m.status,
    user: { name: userById.get(m.userId)?.name ?? null, email: userById.get(m.userId)?.email ?? "" },
    role: { name: roleById.get(m.roleId)?.name ?? "" },
  }));

  const manage = canManageWorkspace(active.role);
  const invite = canInviteMembers(active.role);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {active.workspace.name} &middot; /{active.workspace.slug}
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Workspace name</h2>
        {manage ? (
          <RenameWorkspaceForm currentName={active.workspace.name} />
        ) : (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            Only owners and admins can rename the workspace.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Members</h2>
        <MembersTable members={members} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Invite a member</h2>
        {invite ? (
          <InviteMemberForm />
        ) : (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            Only owners and admins can invite members.
          </p>
        )}
      </section>
    </div>
  );
}
