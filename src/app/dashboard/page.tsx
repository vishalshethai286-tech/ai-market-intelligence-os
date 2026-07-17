import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { getOnboardingStatus } from "@/lib/onboarding";
import { dbConnect } from "@/lib/mongodb";
import { WorkspaceMember } from "@/models";
import { getLatestAnalysis } from "@/lib/website-analysis";
import { getCompanyProfile } from "@/lib/company-profile/service";
import { listProductServices } from "@/lib/product-discovery/service";
import { getCustomerDashboardStats } from "@/lib/customers/service";
import { getProjectDashboardStats } from "@/lib/projects/service";
import { countTenderBuyers } from "@/lib/tenders/buyer-service";
import { getTenderDashboardStats } from "@/lib/tenders/opportunity-service";
import { getVendorRegistrationDashboardStats } from "@/lib/vendor-registrations/service";
import { getContactStats } from "@/lib/contacts/service";
import { getContactDiscoveryStats } from "@/lib/contact-discovery/service";
import { getWorkspaceContactCoverageSummary } from "@/lib/contacts/recommendations";
import { getDuplicateDashboardStats } from "@/lib/dedup/service";
import { getDiscoveryDashboardStats } from "@/lib/discovery-brain/runs";
import { canInviteMembers } from "@/lib/access-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C", UNSCORED: "Unscored" };
const STAGE_LABEL: Record<string, string> = {
  ANNOUNCED: "Announced",
  PLANNING: "Planning",
  FEED: "FEED",
  TENDER: "Tender",
  AWARDED: "Awarded",
  CONSTRUCTION: "Construction",
  OPERATIONAL: "Operational",
  UNKNOWN: "Unknown",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const active = await requireActiveWorkspace();
  await dbConnect();

  const [
    memberCount,
    latestAnalysis,
    companyProfile,
    productServices,
    onboardingStatus,
    customerStats,
    projectStats,
    duplicateStats,
    tenderBuyerCount,
    vendorRegistrationStats,
    discoveryStats,
    contactStats,
    contactDiscoveryStats,
    contactCoverage,
  ] = await Promise.all([
    WorkspaceMember.countDocuments({ workspaceId: active.workspace.id, deletedAt: null }),
    getLatestAnalysis(active.workspace.id),
    getCompanyProfile(active.workspace.id),
    listProductServices(active.workspace.id),
    getOnboardingStatus(active.workspace.id),
    getCustomerDashboardStats(active.workspace.id),
    getProjectDashboardStats(active.workspace.id),
    getDuplicateDashboardStats(active.workspace.id),
    countTenderBuyers(active.workspace.id),
    getVendorRegistrationDashboardStats(active.workspace.id),
    getDiscoveryDashboardStats(active.workspace.id),
    getContactStats(active.workspace.id),
    getContactDiscoveryStats(active.workspace.id),
    getWorkspaceContactCoverageSummary(active.workspace.id),
  ]);
  const tenderStats = await getTenderDashboardStats(active.workspace.id, tenderBuyerCount);

  const approvedProductCount = productServices.filter((p) => p.status === "APPROVED").length;
  const pendingProductCount = productServices.filter((p) => p.status === "PENDING_REVIEW").length;

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
        {active.workspace.name} <Badge className="ml-1">{active.role}</Badge>{" "}
        <Badge variant={onboardingStatus.status === "COMPLETED" ? "success" : "warning"}>
          Onboarding {onboardingStatus.status === "COMPLETED" ? "complete" : "incomplete"}
        </Badge>
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
            <div className="flex items-center justify-between">
              <CardTitle>Company Profile</CardTitle>
              {companyProfile?.status === "APPROVED" && <Badge variant="success">Approved</Badge>}
              {companyProfile?.status === "PENDING_REVIEW" && <Badge variant="warning">Needs review</Badge>}
            </div>
            <CardDescription>
              {companyProfile?.status === "APPROVED"
                ? companyProfile.companyName || "Approved"
                : companyProfile
                  ? "Draft ready for review"
                  : "Not generated yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-black/50 dark:text-white/50">
              {companyProfile?.status === "APPROVED"
                ? `${companyProfile.industry || "Industry unclear"} · ${Math.round(companyProfile.confidenceScore * 100)}% confidence`
                : companyProfile
                  ? "Finish reviewing the AI-generated draft to approve it."
                  : "Generate a profile from your website analysis."}
            </p>
            <Link
              href="/dashboard/company-profile"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {companyProfile?.status === "APPROVED"
                ? "Review profile"
                : companyProfile
                  ? "Finish review"
                  : "Get started"}{" "}
              &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Products & Services</CardTitle>
              {pendingProductCount > 0 && <Badge variant="warning">{pendingProductCount} to review</Badge>}
            </div>
            <CardDescription>
              {productServices.length > 0 ? "Approved catalog" : "Not discovered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {productServices.length > 0 ? (
              <p className="text-2xl font-semibold tracking-tight">{approvedProductCount}</p>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Discover products and services from your website content.
              </p>
            )}
            <Link
              href="/dashboard/products"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {productServices.length > 0 ? "Review catalog" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Customers</CardTitle>
              {customerStats.newToday > 0 && <Badge variant="success">{customerStats.newToday} new today</Badge>}
            </div>
            <CardDescription>
              {customerStats.total > 0 ? `${customerStats.aPlusCount} A+ priority` : "None discovered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customerStats.total > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{customerStats.total}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {Object.entries(customerStats.byPriority)
                    .map(([priority, count]) => `${PRIORITY_LABEL[priority] ?? priority}: ${count}`)
                    .join(" · ") || "Not yet scored"}
                </p>
                {customerStats.byCountry.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Top countries: {customerStats.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")}
                  </p>
                )}
                {customerStats.recent.length > 0 && (
                  <p className="mt-1 truncate text-xs text-black/50 dark:text-white/50">
                    Recent: {customerStats.recent.map((c) => c.customerName).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Process discovered raw results to surface target customers here.
              </p>
            )}
            <Link
              href="/dashboard/customers"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {customerStats.total > 0 ? "View customers" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Projects</CardTitle>
              {projectStats.newToday > 0 && <Badge variant="success">{projectStats.newToday} new today</Badge>}
            </div>
            <CardDescription>
              {projectStats.total > 0 ? `${projectStats.aPlusCount} A+ priority` : "None discovered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {projectStats.total > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{projectStats.total}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {Object.entries(projectStats.byPriority)
                    .map(([priority, count]) => `${PRIORITY_LABEL[priority] ?? priority}: ${count}`)
                    .join(" · ") || "Not yet scored"}
                </p>
                {projectStats.byCountry.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Top countries: {projectStats.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")}
                  </p>
                )}
                {Object.keys(projectStats.byStage).length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    By stage: {Object.entries(projectStats.byStage).map(([stage, count]) => `${STAGE_LABEL[stage] ?? stage}: ${count}`).join(" · ")}
                  </p>
                )}
                {projectStats.recent.length > 0 && (
                  <p className="mt-1 truncate text-xs text-black/50 dark:text-white/50">
                    Recent: {projectStats.recent.map((p) => p.projectName).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Process discovered raw results to surface project opportunities here.
              </p>
            )}
            <Link
              href="/dashboard/projects"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {projectStats.total > 0 ? "View projects" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Tenders</CardTitle>
              {tenderStats.newToday > 0 && <Badge variant="success">{tenderStats.newToday} new today</Badge>}
            </div>
            <CardDescription>
              {tenderStats.totalOpportunities > 0 || tenderStats.totalBuyers > 0
                ? `${tenderStats.totalBuyers} buyers · ${tenderStats.active} active · ${tenderStats.expired} expired`
                : "None discovered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tenderStats.totalOpportunities > 0 || tenderStats.totalBuyers > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{tenderStats.totalOpportunities}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {tenderStats.aPlusCount} A+ ·{" "}
                  {Object.entries(tenderStats.byPriority)
                    .map(([priority, count]) => `${PRIORITY_LABEL[priority] ?? priority}: ${count}`)
                    .join(" · ") || "Not yet scored"}
                </p>
                {tenderStats.byCountry.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Top countries: {tenderStats.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")}
                  </p>
                )}
                {tenderStats.expiringSoon.length > 0 && (
                  <p className="mt-1 truncate text-xs text-black/50 dark:text-white/50">
                    Expiring soon: {tenderStats.expiringSoon.map((t) => t.tenderTitle).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Process discovered raw results to surface tender buyers and live tenders here.
              </p>
            )}
            <Link
              href="/dashboard/live-tenders"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {tenderStats.totalOpportunities > 0 ? "View live tenders" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Duplicates</CardTitle>
              {duplicateStats.pendingReview > 0 && <Badge variant="warning">{duplicateStats.pendingReview} pending</Badge>}
            </div>
            <CardDescription>{duplicateStats.found > 0 ? "Deduplication engine" : "None found yet"}</CardDescription>
          </CardHeader>
          <CardContent>
            {duplicateStats.found > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{duplicateStats.found}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {duplicateStats.autoMerged} auto-merged · {duplicateStats.manuallyMerged} manually merged
                </p>
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Run deduplication from the Customers or Duplicates page to find likely-duplicate records.
              </p>
            )}
            <Link
              href="/dashboard/duplicates"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {duplicateStats.found > 0 ? "Review duplicates" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Vendor Registrations</CardTitle>
              {vendorRegistrationStats.newToday > 0 && <Badge variant="success">{vendorRegistrationStats.newToday} new today</Badge>}
            </div>
            <CardDescription>
              {vendorRegistrationStats.total > 0 ? `${vendorRegistrationStats.approved} approved · ${vendorRegistrationStats.submitted} submitted` : "None discovered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vendorRegistrationStats.total > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{vendorRegistrationStats.total}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {Object.entries(vendorRegistrationStats.byStatus)
                    .map(([status, count]) => `${status.replace(/_/g, " ")}: ${count}`)
                    .join(" · ")}
                </p>
                {vendorRegistrationStats.byCountry.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Top countries: {vendorRegistrationStats.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Process discovered raw results to surface vendor registration opportunities here.
              </p>
            )}
            <Link
              href="/dashboard/vendor-registrations"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {vendorRegistrationStats.total > 0 ? "View vendor registrations" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Contacts</CardTitle>
              {contactStats.newToday > 0 && <Badge variant="success">{contactStats.newToday} new today</Badge>}
            </div>
            <CardDescription>
              {contactStats.total > 0 ? `${contactStats.aPlusCount} A+ · ${contactStats.needingFollowUp} need follow-up` : "None added yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contactStats.total > 0 ? (
              <>
                <p className="text-2xl font-semibold tracking-tight">{contactStats.total}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {Object.entries(contactStats.byRoleCategory)
                    .map(([role, count]) => `${role.replace(/_/g, " ")}: ${count}`)
                    .join(" · ")}
                </p>
                {contactStats.byCountry.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Top countries: {contactStats.byCountry.map((c) => `${c.country} (${c.count})`).join(", ")}
                  </p>
                )}
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {contactStats.withoutEmail} without email · {contactStats.withoutPhone} without phone · {contactStats.highPriorityCount} high priority
                </p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {contactStats.needingEnrichment} need enrichment · {contactStats.overdueContactTasks} overdue tasks · coverage {contactCoverage.coveragePercentage}%
                </p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  linked: {contactStats.linkedToTargetCustomers} customers, {contactStats.linkedToProjects} projects,{" "}
                  {contactStats.linkedToTenderBuyers} tender buyers, {contactStats.linkedToTenderOpportunities} live tenders, {contactStats.linkedToVendorRegistrations} vendor registrations
                </p>
                {contactCoverage.entitiesWithoutContact.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    {contactCoverage.entitiesWithoutContact.length} companies/opportunities have no contact yet
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">Add contacts manually, or link one from a discovered record.</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/dashboard/contacts" className="inline-block text-sm text-black/50 hover:text-current dark:text-white/50">
                {contactStats.total > 0 ? "View contacts" : "Get started"} &rarr;
              </Link>
              <Link href="/dashboard/contact-tasks" className="inline-block text-sm text-black/50 hover:text-current dark:text-white/50">
                Contact tasks &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Contact Discovery</CardTitle>
              {contactDiscoveryStats.failedExtractions > 0 && (
                <Badge variant="danger">{contactDiscoveryStats.failedExtractions} failed</Badge>
              )}
            </div>
            <CardDescription>
              {contactDiscoveryStats.totalTargets > 0
                ? `${contactDiscoveryStats.publicContactsDiscovered} public contacts found`
                : "No targets yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{contactDiscoveryStats.totalTargets}</p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {contactDiscoveryStats.queuedSearches} searches queued · {contactDiscoveryStats.rawResultsPendingExtraction} raw results pending
            </p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {contactDiscoveryStats.contactsDiscoveredToday} discovered today · {contactDiscoveryStats.contactsUpdatedToday} updated today
            </p>
            <Link
              href="/dashboard/contact-discovery"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              {contactDiscoveryStats.totalTargets > 0 ? "View contact discovery" : "Get started"} &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Discovery</CardTitle>
              {discoveryStats.errorsNeedingAttention > 0 && <Badge variant="danger">{discoveryStats.errorsNeedingAttention} need attention</Badge>}
            </div>
            <CardDescription>{discoveryStats.totalRuns > 0 ? `${discoveryStats.totalRuns} runs · ${discoveryStats.failedRuns} failed` : "No runs yet"}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{discoveryStats.totalRawResults}</p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {discoveryStats.unprocessedRawResults} unprocessed raw result{discoveryStats.unprocessedRawResults === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Monthly discovery usage: ${discoveryStats.monthlyEstimatedApiCost.toFixed(2)}
            </p>
            <Link
              href="/dashboard/raw-search-results"
              className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50"
            >
              View raw results &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>Exportable summaries of discovered opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-black/50 dark:text-white/50">
              Daily/weekly, country-wise, product-wise, duplicate, tender expiry, and vendor registration reports, each with a CSV export.
            </p>
            <Link href="/dashboard/reports" className="mt-1 inline-block text-sm text-black/50 hover:text-current dark:text-white/50">
              View reports &rarr;
            </Link>
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
