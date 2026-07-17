import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { Workspace, WorkspaceMember, TargetCompany, Subscription, Plan } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — Workspaces" };

export default async function PlatformAdminWorkspacesPage() {
  await dbConnect();
  const workspaces = await Workspace.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200);
  const workspaceIds = workspaces.map((w) => w.id);

  const [memberCounts, targetCompanyCounts, subscriptions] = await Promise.all([
    WorkspaceMember.aggregate([
      { $match: { workspaceId: { $in: workspaceIds }, deletedAt: null } },
      { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
    ]),
    TargetCompany.aggregate([
      { $match: { workspaceId: { $in: workspaceIds } } },
      { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
    ]),
    Subscription.find({ workspaceId: { $in: workspaceIds } }),
  ]);

  const memberCountByWorkspaceId = new Map(memberCounts.map((m) => [m._id as string, m.count as number]));
  const targetCompanyCountByWorkspaceId = new Map(targetCompanyCounts.map((m) => [m._id as string, m.count as number]));

  const planIds = subscriptions.map((s) => s.planId);
  const plans = await Plan.find({ _id: { $in: planIds } });
  const planById = new Map(plans.map((p) => [p.id, p]));
  const subscriptionByWorkspaceId = new Map(subscriptions.map((s) => [s.workspaceId, s]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Workspaces" description={`${workspaces.length} most recent workspaces, read-only.`} />

      {workspaces.length === 0 ? (
        <EmptyState title="No workspaces yet" />
      ) : (
        <div className="rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Target companies</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => {
                const subscription = subscriptionByWorkspaceId.get(workspace.id);
                const plan = subscription ? planById.get(subscription.planId) : undefined;
                return (
                  <TableRow key={workspace.id}>
                    <TableCell className="font-medium">{workspace.name}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{workspace.slug}</TableCell>
                    <TableCell>
                      {plan ? (
                        <Badge variant="outline">{plan.name}</Badge>
                      ) : (
                        <span className="text-black/50 dark:text-white/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>{memberCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{targetCompanyCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {workspace.createdAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
