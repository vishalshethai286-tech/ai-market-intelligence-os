import type { Metadata } from "next";
import { dbConnect } from "@/lib/mongodb";
import { DiscoveryRun, DiscoveryErrorLog } from "@/models";
import { isMockAIEnabled } from "@/lib/ai-extraction/env";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform Admin — System Health" };

function statusBadge(configured: boolean, onLabel: string, offLabel: string) {
  return <Badge variant={configured ? "success" : "warning"}>{configured ? onLabel : offLabel}</Badge>;
}

export default async function PlatformAdminSystemHealthPage() {
  let dbConnected = true;
  try {
    await dbConnect();
  } catch {
    dbConnected = false;
  }

  const since24h = new Date();
  since24h.setDate(since24h.getDate() - 1);
  const [failedRuns24h, totalRuns24h, recentErrors24h] = dbConnected
    ? await Promise.all([
        DiscoveryRun.countDocuments({ status: "FAILED", createdAt: { $gte: since24h } }),
        DiscoveryRun.countDocuments({ createdAt: { $gte: since24h } }),
        DiscoveryErrorLog.countDocuments({ createdAt: { $gte: since24h } }),
      ])
    : [0, 0, 0];

  const mockAI = isMockAIEnabled();
  const mockSearch = process.env.ENABLE_MOCK_SEARCH === "true" || (!process.env.SEARCH_PROVIDER && !process.env.TAVILY_API_KEY);
  const stripeConfigured = isStripeConfigured();
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="System Health" description="Live configuration and recent failure rates, read-only." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Database" value={dbConnected ? "Connected" : "Unreachable"} />
        <StatCard label="Discovery runs, last 24h" value={totalRuns24h} hint={`${failedRuns24h} failed`} />
        <StatCard label="Search errors, last 24h" value={recentErrors24h} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration status</CardTitle>
          <CardDescription>Which external providers are live vs. running in mock mode in this environment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span>AI extraction (Anthropic)</span>
            {statusBadge(!mockAI, "Live", "Mock")}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Search provider</span>
            {statusBadge(!mockSearch, "Live", "Mock")}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Stripe billing</span>
            {statusBadge(stripeConfigured, "Configured", "Mock billing mode")}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Transactional email (Resend)</span>
            {statusBadge(emailConfigured, "Configured", "Not configured")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
