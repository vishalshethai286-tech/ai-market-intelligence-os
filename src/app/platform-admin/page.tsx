import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { Workspace, User, Subscription, TargetCompany, DiscoveryRun, DiscoveryErrorLog, Contact } from "@/models";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = { title: "Platform Admin — Overview" };

export default async function PlatformAdminOverviewPage() {
  await dbConnect();
  const since24h = new Date();
  since24h.setDate(since24h.getDate() - 1);
  const [workspaceCount, userCount, activeSubscriptionCount, targetCompanyCount, discoveryRunCount, contactCount, failedRuns24h, errors24h] =
    await Promise.all([
      Workspace.countDocuments({ deletedAt: null }),
      User.countDocuments({ deletedAt: null }),
      Subscription.countDocuments({ status: { $in: ["TRIALING", "ACTIVE"] } }),
      TargetCompany.countDocuments(),
      DiscoveryRun.countDocuments(),
      Contact.countDocuments(),
      DiscoveryRun.countDocuments({ status: "FAILED", createdAt: { $gte: since24h } }),
      DiscoveryErrorLog.countDocuments({ createdAt: { $gte: since24h } }),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Overview" description="Cross-workspace platform stats, read-only." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Workspaces" value={workspaceCount} />
        <StatCard label="Users" value={userCount} />
        <StatCard label="Active/trialing subscriptions" value={activeSubscriptionCount} />
        <StatCard label="Target companies discovered" value={targetCompanyCount} />
        <StatCard label="Contacts discovered" value={contactCount} />
        <StatCard label="Discovery runs" value={discoveryRunCount} />
        <StatCard label="Failed runs, last 24h" value={failedRuns24h} />
        <StatCard label="Search errors, last 24h" value={errors24h} />
      </div>
    </div>
  );
}
