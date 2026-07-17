import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { User, WorkspaceMember } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform Admin — Users" };

export default async function PlatformAdminUsersPage() {
  await dbConnect();
  const users = await User.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200);

  const membershipCounts = await WorkspaceMember.aggregate([
    { $match: { userId: { $in: users.map((u) => u.id) }, deletedAt: null } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);
  const membershipCountByUserId = new Map(membershipCounts.map((m) => [m._id as string, m.count as number]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description={`${users.length} most recent users, read-only.`} />

      {users.length === 0 ? (
        <EmptyState title="No users yet" />
      ) : (
        <div className="rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{user.email}</TableCell>
                  <TableCell>{membershipCountByUserId.get(user.id) ?? 0}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {user.lastLoginAt ? user.lastLoginAt.toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">
                    {user.createdAt.toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
