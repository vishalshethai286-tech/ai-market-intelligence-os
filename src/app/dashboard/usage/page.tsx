import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { dbConnect } from "@/lib/mongodb";
import { UsageLog } from "@/models";
import { getWorkspaceUsage } from "@/lib/billing/usage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsageMeter } from "@/components/billing/usage-meter";

export const metadata: Metadata = { title: "Usage" };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

const RECORD_COUNT_METRIC_SET = new Set([
  "customer_created",
  "project_created",
  "tender_buyer_created",
  "live_tender_created",
  "vendor_registration_created",
  "contact_created",
  "product_service_created",
]);

export default async function UsagePage() {
  const active = await requireActiveWorkspace();

  await dbConnect();
  const [usage, recentLogs] = await Promise.all([
    getWorkspaceUsage(active.workspace.id),
    UsageLog.find({ workspaceId: active.workspace.id }).sort({ occurredAt: -1 }).limit(50),
  ]);

  const recordMetrics = usage.metrics.filter((m) => RECORD_COUNT_METRIC_SET.has(m.metric));
  const flowMetrics = usage.metrics.filter((m) => !RECORD_COUNT_METRIC_SET.has(m.metric));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Usage"
        description={`${usage.planName} · monthly usage resets ${formatDate(usage.periodEnd)}.`}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Records</CardTitle>
            <CardDescription>Total in this workspace, against your plan&apos;s per-record limits.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {recordMetrics.map((metric) => (
              <UsageMeter key={metric.metric} label={metric.label} current={metric.current} limit={metric.limit} percentUsed={metric.percentUsed} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This period</CardTitle>
            <CardDescription>{formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <UsageMeter
              label="Seats"
              current={usage.seatsUsed}
              limit={usage.seatsLimit}
              percentUsed={usage.seatsLimit ? Math.round((usage.seatsUsed / usage.seatsLimit) * 100) : null}
            />
            {flowMetrics.map((metric) => (
              <UsageMeter key={metric.metric} label={metric.label} current={metric.current} limit={metric.limit} percentUsed={metric.percentUsed} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent usage events</CardTitle>
          <CardDescription>Last {recentLogs.length} metered events, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <EmptyState title="No metered usage yet" description="Discovery runs, exports, and email drafts will show up here." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{String(log.metric).replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{String(log.quantity)}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{new Date(log.occurredAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
