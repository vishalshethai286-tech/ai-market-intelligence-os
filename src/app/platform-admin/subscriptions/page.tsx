import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { Subscription, Plan, Workspace } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — Subscriptions" };

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  TRIALING: "warning",
  ACTIVE: "success",
  PAST_DUE: "danger",
  CANCELED: "danger",
  EXPIRED: "danger",
  INCOMPLETE: "default",
};

export default async function PlatformAdminSubscriptionsPage() {
  await dbConnect();
  const subscriptions = await Subscription.find({}).sort({ updatedAt: -1 }).limit(200);
  const workspaceIds = subscriptions.map((s) => s.workspaceId);
  const planIds = subscriptions.map((s) => s.planId);

  const [workspaces, plans] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } }),
    Plan.find({ _id: { $in: planIds } }),
  ]);
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
  const planById = new Map(plans.map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Subscriptions" description={`${subscriptions.length} most recently updated subscriptions, read-only.`} />

      {subscriptions.length === 0 ? (
        <EmptyState title="No subscriptions yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Trial ends</TableHead>
                <TableHead>Period ends</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => {
                const workspace = workspaceById.get(subscription.workspaceId);
                const plan = planById.get(subscription.planId);
                return (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">{workspace?.name ?? subscription.workspaceId}</TableCell>
                    <TableCell>{plan ? <Badge variant="outline">{plan.name}</Badge> : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[subscription.status] ?? "default"}>{subscription.status.toLowerCase()}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{subscription.billingProvider}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{subscription.updatedAt.toLocaleDateString()}</TableCell>
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
