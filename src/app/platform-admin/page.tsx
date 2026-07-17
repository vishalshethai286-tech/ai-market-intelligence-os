import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { Workspace, User, Subscription, TargetCompany, UsageLog } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = { title: "Platform Admin — Overview" };

export default async function PlatformAdminOverviewPage() {
  await dbConnect();
  const [workspaceCount, userCount, activeSubscriptionCount, targetCompanyCount, discoveryRunCount] =
    await Promise.all([
      Workspace.countDocuments({ deletedAt: null }),
      User.countDocuments({ deletedAt: null }),
      Subscription.countDocuments({ status: { $in: ["TRIALING", "ACTIVE"] } }),
      TargetCompany.countDocuments(),
      UsageLog.countDocuments({ metric: "discovery_run" }),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Overview" description="Cross-workspace platform stats, read-only." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Workspaces" value={workspaceCount} />
        <StatCard label="Users" value={userCount} />
        <StatCard label="Active/trialing subscriptions" value={activeSubscriptionCount} />
        <StatCard label="Target companies discovered" value={targetCompanyCount} />
        <StatCard label="Discovery runs" value={discoveryRunCount} />
      </div>
    </div>
  );
}
