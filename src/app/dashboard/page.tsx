import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { getLatestAnalysis } from "@/lib/website-analysis";
import { canInviteMembers } from "@/lib/access-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const active = await requireActiveWorkspace();

  const [memberCount, latestAnalysis] = await Promise.all([
    prisma.workspaceMember.count({
      where: { workspaceId: active.workspace.id, deletedAt: null },
    }),
    getLatestAnalysis(active.workspace.id),
  ]);

  const identifiedPageCount = latestAnalysis?.identifiedPages
    ? Object.values(latestAnalysis.identifiedPages as Record<string, unknown[]>).filter(
        (pages) => pages.length > 0,
      ).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {session.user.name ?? session.user.email}
      </h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        {active.workspace.name} <Badge className="ml-1">{active.role}</Badge>
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>People in this workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{memberCount}</p>
            <Link
              href="/dashboard/settings"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              Manage members &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Market Signals</CardTitle>
              {latestAnalysis?.status === "COMPLETED" && <Badge variant="success">Analyzed</Badge>}
              {latestAnalysis?.status === "FAILED" && <Badge variant="danger">Failed</Badge>}
              {latestAnalysis?.status === "RUNNING" && <Badge variant="warning">Analyzing</Badge>}
            </div>
            <CardDescription>
              {latestAnalysis ? latestAnalysis.url : "Nothing tracked yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!latestAnalysis && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Signals will show up here once this workspace is connected to a data source.
              </p>
            )}
            {latestAnalysis?.status === "COMPLETED" && (
              <p className="text-sm text-black/50 dark:text-white/50">
                {latestAnalysis.title ?? "Homepage analyzed"} &middot; {identifiedPageCount} page{" "}
                {identifiedPageCount === 1 ? "type" : "types"} identified
              </p>
            )}
            {latestAnalysis?.status === "FAILED" && (
              <p className="text-sm text-black/50 dark:text-white/50">{latestAnalysis.error}</p>
            )}
            {latestAnalysis?.status === "RUNNING" && (
              <p className="text-sm text-black/50 dark:text-white/50">Fetching homepage...</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>No reports generated yet</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-black/50 dark:text-white/50">
              Generated reports for this workspace will appear here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Set up your workspace</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Link href="/dashboard/settings" className="text-black/70 hover:text-current dark:text-white/70">
              &middot; Rename your workspace
            </Link>
            {canInviteMembers(active.role) && (
              <Link href="/dashboard/settings" className="text-black/70 hover:text-current dark:text-white/70">
                &middot; Invite a teammate
              </Link>
            )}
            <Link href="/dashboard/workspaces/new" className="text-black/70 hover:text-current dark:text-white/70">
              &middot; Create another workspace
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
