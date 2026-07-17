import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import {
  getDailyReport,
  getWeeklyReport,
  getCountryWiseReport,
  getProductWiseReport,
  getIndustryWiseReport,
  getSourceWiseReport,
  getDuplicateReport,
  getTenderExpiryReport,
  getVendorRegistrationReport,
  getContactReport,
  getContactEnrichmentReport,
  getFollowUpTaskReport,
  getMissingContactCoverageReport,
  getEmailTemplateUsageReport,
} from "@/lib/reports/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Reports" };

function ExportLink({ href }: { href: string }) {
  return (
    <a href={href}>
      <Button type="button" variant="outline" size="sm">
        Export CSV
      </Button>
    </a>
  );
}

function SectionHeader({ title, exportHref }: { title: string; exportHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium">{title}</h2>
      {exportHref && <ExportLink href={exportHref} />}
    </div>
  );
}

export default async function ReportsPage() {
  const active = await requireActiveWorkspace();

  const [
    daily,
    weekly,
    byCountry,
    byProduct,
    byIndustry,
    bySource,
    byDuplicate,
    tenderExpiry,
    vendorRegistration,
    contactReport,
    contactEnrichment,
    followUpTasks,
    missingContactCoverage,
    emailTemplateUsage,
  ] = await Promise.all([
    getDailyReport(active.workspace.id),
    getWeeklyReport(active.workspace.id),
    getCountryWiseReport(active.workspace.id),
    getProductWiseReport(active.workspace.id),
    getIndustryWiseReport(active.workspace.id),
    getSourceWiseReport(active.workspace.id),
    getDuplicateReport(active.workspace.id),
    getTenderExpiryReport(active.workspace.id),
    getVendorRegistrationReport(active.workspace.id),
    getContactReport(active.workspace.id),
    getContactEnrichmentReport(active.workspace.id),
    getFollowUpTaskReport(active.workspace.id),
    getMissingContactCoverageReport(active.workspace.id),
    getEmailTemplateUsageReport(active.workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reports"
        description="Exportable summaries of discovered opportunities for this workspace, generated on demand from the current data."
      />

      <section>
        <SectionHeader title="Daily discovery report (last 24 hours)" exportHref="/api/export/reports/daily" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Customers" value={daily.customersCreated} />
          <StatCard label="Projects" value={daily.projectsCreated} />
          <StatCard label="Tender buyers" value={daily.tenderBuyersCreated} />
          <StatCard label="Live tenders" value={daily.liveTendersCreated} />
          <StatCard label="Vendor registrations" value={daily.vendorRegistrationsCreated} />
          <StatCard label="Duplicates found" value={daily.duplicatesFound} />
          <StatCard label="Raw results processed" value={daily.rawResultsProcessed} />
          <StatCard label="Errors" value={daily.errors} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Weekly discovery report (last 7 days)" exportHref="/api/export/reports/weekly" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Customers" value={weekly.customersCreated} />
          <StatCard label="Projects" value={weekly.projectsCreated} />
          <StatCard label="Tender buyers" value={weekly.tenderBuyersCreated} />
          <StatCard label="Live tenders" value={weekly.liveTendersCreated} />
          <StatCard label="Vendor registrations" value={weekly.vendorRegistrationsCreated} />
          <StatCard label="Duplicates found" value={weekly.duplicatesFound} />
          <StatCard label="Raw results processed" value={weekly.rawResultsProcessed} />
          <StatCard label="Errors" value={weekly.errors} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Country-wise report" exportHref="/api/export/reports/country" />
        {byCountry.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No discovered records yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Tender buyers</TableHead>
                  <TableHead>Live tenders</TableHead>
                  <TableHead>Vendor registrations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCountry.map((row) => (
                  <TableRow key={row.country}>
                    <TableCell className="font-medium">{row.country}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.customers}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.projects}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.tenderBuyers}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.liveTenders}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.vendorRegistrations}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionHeader title="Product-wise report" exportHref="/api/export/reports/product" />
        {byProduct.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No matched products/services yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product/service</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Tenders</TableHead>
                  <TableHead>Vendor registrations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProduct.map((row) => (
                  <TableRow key={row.productServiceName}>
                    <TableCell className="font-medium">{row.productServiceName}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.customers}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.projects}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.tenders}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.vendorRegistrations}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Industry-wise report</h2>
        {byIndustry.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No matched industries yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Industry</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byIndustry.map((row) => (
                  <TableRow key={row.industry}>
                    <TableCell className="font-medium">{row.industry}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.customers}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.projects}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Source-wise report</h2>
        {bySource.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No raw search results yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Extracted</TableHead>
                  <TableHead>Unprocessed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySource.map((row) => (
                  <TableRow key={row.sourceProvider}>
                    <TableCell className="font-medium">{row.sourceProvider}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.total}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.extracted}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{row.unprocessed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Duplicate report</h2>
        <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record type</TableHead>
                <TableHead>Pending review</TableHead>
                <TableHead>Auto merged</TableHead>
                <TableHead>Manually merged</TableHead>
                <TableHead>Rejected</TableHead>
                <TableHead>Not duplicate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDuplicate.map((row) => (
                <TableRow key={row.recordType}>
                  <TableCell className="font-medium">{row.recordType}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row.pendingReview}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row.autoMerged}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row.manuallyMerged}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row.rejected}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{row.notDuplicate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Tender expiry report" exportHref="/api/export/reports/tender-expiry" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Active" value={tenderExpiry.active} />
          <StatCard label="Expiring in 7 days" value={tenderExpiry.expiringIn7Days} />
          <StatCard label="Expired" value={tenderExpiry.expired} />
          <StatCard label="Submitted" value={tenderExpiry.submitted} />
          <StatCard label="Won" value={tenderExpiry.won} />
          <StatCard label="Lost" value={tenderExpiry.lost} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Vendor registration report" exportHref="/api/export/reports/vendor-registration" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="New" value={vendorRegistration.new} />
          <StatCard label="Reviewed" value={vendorRegistration.reviewed} />
          <StatCard label="Not started" value={vendorRegistration.notStarted} />
          <StatCard label="In progress" value={vendorRegistration.inProgress} />
          <StatCard label="Submitted" value={vendorRegistration.submitted} />
          <StatCard label="Approved" value={vendorRegistration.approved} />
          <StatCard label="Rejected" value={vendorRegistration.rejected} />
          <StatCard label="Archived" value={vendorRegistration.archived} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Contact report" exportHref="/api/export/reports/contacts" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <StatCard label="Total contacts" value={contactReport.total} />
          <StatCard label="Publicly discovered" value={contactReport.publiclyDiscovered} />
          <StatCard label="Manually added" value={contactReport.manuallyAdded} />
          <StatCard label="With email" value={contactReport.withEmail} />
          <StatCard label="Without email" value={contactReport.withoutEmail} />
          <StatCard label="With LinkedIn" value={contactReport.withLinkedIn} />
          <StatCard label="Needing follow-up" value={contactReport.needingFollowUp} />
          <StatCard label="Needing verification" value={contactReport.needingVerification} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By role category</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role category</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactReport.byRoleCategory).map(([role, count]) => (
                    <TableRow key={role}>
                      <TableCell className="font-medium">{role.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By country</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactReport.byCountry.map((row) => (
                    <TableRow key={row.country}>
                      <TableCell className="font-medium">{row.country}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By source type</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source type</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactReport.bySourceType).map(([sourceType, count]) => (
                    <TableRow key={sourceType}>
                      <TableCell className="font-medium">{sourceType.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By status</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactReport.byStatus).map(([status, count]) => (
                    <TableRow key={status}>
                      <TableCell className="font-medium">{status.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By discovery target type</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Related record type</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactReport.byDiscoveryTargetType).map(([type, count]) => (
                    <TableRow key={type}>
                      <TableCell className="font-medium">{type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Contact enrichment report" exportHref="/api/export/reports/contact-enrichment" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Average enrichment score" value={contactEnrichment.averageEnrichmentScore} />
          <StatCard label="Do not contact" value={contactEnrichment.doNotContactCount} />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By enrichment status</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactEnrichment.byEnrichmentStatus).map(([status, count]) => (
                    <TableRow key={status}>
                      <TableCell className="font-medium">{status.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By recommended action</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactEnrichment.byRecommendedAction).map(([action, count]) => (
                    <TableRow key={action}>
                      <TableCell className="font-medium">{action.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By best contact for</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Best for</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(contactEnrichment.byBestContactFor).map(([value, count]) => (
                    <TableRow key={value}>
                      <TableCell className="font-medium">{value.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Follow-up task report" exportHref="/api/export/contact-tasks" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Overdue" value={followUpTasks.overdue} />
          <StatCard label="Completed this week" value={followUpTasks.completedThisWeek} />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By task type</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(followUpTasks.byTaskType).map(([type, count]) => (
                    <TableRow key={type}>
                      <TableCell className="font-medium">{type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By status</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(followUpTasks.byStatus).map(([status, count]) => (
                    <TableRow key={status}>
                      <TableCell className="font-medium">{status.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-black/50 dark:text-white/50">By priority</h3>
            <div className="mt-2 rounded-xl border border-black/[.08] dark:border-white/[.145]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(followUpTasks.byPriority).map(([priority, count]) => (
                    <TableRow key={priority}>
                      <TableCell className="font-medium">{priority.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-black/60 dark:text-white/60">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="Missing contact coverage report" exportHref="/api/export/reports/missing-contact-coverage" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Total active entities" value={missingContactCoverage.totalEntities} />
          <StatCard label="With a contact" value={missingContactCoverage.entitiesWithContact} />
          <StatCard label="Coverage" value={`${missingContactCoverage.coveragePercentage}%`} />
        </div>
        {missingContactCoverage.entitiesWithoutContact.length > 0 && (
          <div className="mt-4 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Related record type</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingContactCoverage.entitiesWithoutContact.map((entity) => (
                  <TableRow key={`${entity.recordType}-${entity.recordId}`}>
                    <TableCell className="font-medium">{entity.recordType.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">{entity.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionHeader title="Email draft/template usage report" exportHref="/api/export/contact-email-templates" />
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total templates" value={emailTemplateUsage.totalTemplates} />
          <StatCard label="Default templates" value={emailTemplateUsage.defaultTemplates} />
          <StatCard label="Custom templates" value={emailTemplateUsage.customTemplates} />
          <StatCard label="Email drafts logged" value={emailTemplateUsage.emailDraftsLogged} />
        </div>
      </section>
    </div>
  );
}
