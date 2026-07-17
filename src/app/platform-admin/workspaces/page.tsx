import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import {
  Workspace,
  WorkspaceMember,
  User,
  Role,
  Subscription,
  Plan,
  TargetCustomer,
  ProjectOpportunity,
  TenderBuyer,
  TenderOpportunity,
  VendorRegistration,
  Contact,
} from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — Workspaces" };

function countByWorkspaceId(rows: { _id: string; count: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r._id, r.count]));
}

export default async function PlatformAdminWorkspacesPage() {
  await dbConnect();
  const workspaces = await Workspace.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200);
  const workspaceIds = workspaces.map((w) => w.id);

  const [ownerRole, memberships, subscriptions, customerCounts, projectCounts, tenderBuyerCounts, liveTenderCounts, vendorRegCounts, contactCounts] =
    await Promise.all([
      Role.findOne({ key: "OWNER" }),
      WorkspaceMember.find({ workspaceId: { $in: workspaceIds }, deletedAt: null }),
      Subscription.find({ workspaceId: { $in: workspaceIds } }),
      TargetCustomer.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
      ProjectOpportunity.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
      TenderBuyer.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
      TenderOpportunity.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
      VendorRegistration.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
      Contact.aggregate([{ $match: { workspaceId: { $in: workspaceIds } } }, { $group: { _id: "$workspaceId", count: { $sum: 1 } } }]),
    ]);

  const memberCountByWorkspaceId = new Map<string, number>();
  const ownerUserIdByWorkspaceId = new Map<string, string>();
  for (const membership of memberships) {
    memberCountByWorkspaceId.set(membership.workspaceId, (memberCountByWorkspaceId.get(membership.workspaceId) ?? 0) + 1);
    if (ownerRole && membership.roleId === ownerRole.id && !ownerUserIdByWorkspaceId.has(membership.workspaceId)) {
      ownerUserIdByWorkspaceId.set(membership.workspaceId, membership.userId);
    }
  }

  const ownerUsers = await User.find({ _id: { $in: [...ownerUserIdByWorkspaceId.values()] } });
  const ownerUserById = new Map(ownerUsers.map((u) => [u.id, u]));

  const planIds = subscriptions.map((s) => s.planId);
  const plans = await Plan.find({ _id: { $in: planIds } });
  const planById = new Map(plans.map((p) => [p.id, p]));
  const subscriptionByWorkspaceId = new Map(subscriptions.map((s) => [s.workspaceId, s]));

  const customerCountByWorkspaceId = countByWorkspaceId(customerCounts);
  const projectCountByWorkspaceId = countByWorkspaceId(projectCounts);
  const tenderBuyerCountByWorkspaceId = countByWorkspaceId(tenderBuyerCounts);
  const liveTenderCountByWorkspaceId = countByWorkspaceId(liveTenderCounts);
  const vendorRegCountByWorkspaceId = countByWorkspaceId(vendorRegCounts);
  const contactCountByWorkspaceId = countByWorkspaceId(contactCounts);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Workspaces" description={`${workspaces.length} most recent workspaces, read-only.`} />

      {workspaces.length === 0 ? (
        <EmptyState title="No workspaces yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Customers</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Tender buyers</TableHead>
                <TableHead>Live tenders</TableHead>
                <TableHead>Vendor regs</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => {
                const subscription = subscriptionByWorkspaceId.get(workspace.id);
                const plan = subscription ? planById.get(subscription.planId) : undefined;
                const ownerUserId = ownerUserIdByWorkspaceId.get(workspace.id);
                const owner = ownerUserId ? ownerUserById.get(ownerUserId) : undefined;
                return (
                  <TableRow key={workspace.id}>
                    <TableCell className="font-medium">{workspace.name}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{owner?.email ?? "—"}</TableCell>
                    <TableCell>{plan ? <Badge variant="outline">{plan.name}</Badge> : <span className="text-black/50 dark:text-white/50">—</span>}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{subscription?.status.toLowerCase() ?? "—"}</TableCell>
                    <TableCell>{memberCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{customerCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{projectCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{tenderBuyerCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{liveTenderCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{vendorRegCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell>{contactCountByWorkspaceId.get(workspace.id) ?? 0}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{workspace.createdAt.toLocaleDateString()}</TableCell>
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
