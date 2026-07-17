import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import {
  listCountryCoverage,
  listIndustryCoverage,
  listProductCoverage,
  listSourceCoverage,
  getLatestCoverageSnapshot,
  getEntityCountsByCountry,
} from "@/lib/discovery-brain/coverage";
import { listProductServices } from "@/lib/product-discovery/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Coverage" };

const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "outline"> = {
  NOT_STARTED: "outline",
  QUEUED: "warning",
  SEARCHING: "warning",
  PARTIALLY_COVERED: "warning",
  COVERED: "success",
  NEEDS_REFRESH: "danger",
  FAILED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  QUEUED: "Queued",
  SEARCHING: "Searching",
  PARTIALLY_COVERED: "Partially covered",
  COVERED: "Covered",
  NEEDS_REFRESH: "Needs refresh",
  FAILED: "Failed",
};

export default async function CoveragePage() {
  const active = await requireActiveWorkspace();

  const [snapshot, countries, industries, products, sources, productServices, entityCountsByCountry] = await Promise.all([
    getLatestCoverageSnapshot(active.workspace.id),
    listCountryCoverage(active.workspace.id),
    listIndustryCoverage(active.workspace.id),
    listProductCoverage(active.workspace.id),
    listSourceCoverage(active.workspace.id),
    listProductServices(active.workspace.id),
    getEntityCountsByCountry(active.workspace.id),
  ]);

  const productNameById = new Map(productServices.map((p) => [p.id, p.name]));
  // Only countries with at least one query (or a non-default status) are worth listing — the other ~180 stay NOT_STARTED and would just be noise.
  const activeCountries = countries.filter((c) => c.status !== "NOT_STARTED" || c.queriesTotal > 0);

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Coverage"
          description="What's been searched and found so far, by country, industry, product, and source."
        />
        <EmptyState
          title="No coverage data yet"
          description="Generate a discovery queue from the Discovery Brain page to start tracking coverage."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Coverage"
        description="What's been searched and found so far, by country, industry, product, and source — discovery is continuous, not instant or guaranteed-complete."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Countries searched" value={snapshot.countriesSearched} />
        <StatCard label="Countries pending" value={snapshot.countriesPending} />
        <StatCard label="Countries needing refresh" value={snapshot.countriesNeedingRefresh} />
        <StatCard label="Coverage" value={`${snapshot.coveragePercentage}%`} />
        <StatCard label="Products/services searched" value={snapshot.productsSearched} />
        <StatCard label="Industries searched" value={snapshot.industriesSearched} />
        <StatCard label="Sources searched" value={snapshot.sourcesSearched} />
        <StatCard label="Sources pending" value={snapshot.sourcesPending} />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Countries</h2>
        {activeCountries.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No country has been queried yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCountries.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.countryName}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[c.status] ?? "outline"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {c.queriesCompleted}/{c.queriesTotal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Industries</h2>
        {industries.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No industry has been queried yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Industry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {industries.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.industry}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[i.status] ?? "outline"}>{STATUS_LABEL[i.status] ?? i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {i.queriesCompleted}/{i.queriesTotal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Products &amp; services</h2>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No product/service has been queried yet.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product/service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {productNameById.get(p.productServiceId) ?? p.productServiceId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[p.status] ?? "outline"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {p.queriesCompleted}/{p.queriesTotal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Sources</h2>
        {sources.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">
            No search sources have been added yet for this workspace.
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.searchSourceId}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status] ?? "outline"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-black/60 dark:text-white/60">
                      {s.queriesCompleted}/{s.queriesTotal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Discovered records by country</h2>
        {entityCountsByCountry.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No customers, projects, tenders, or vendor registrations have been discovered yet.</p>
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
                {entityCountsByCountry.map((row) => (
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
    </div>
  );
}
