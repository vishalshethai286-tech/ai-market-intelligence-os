import "server-only";
import type { PipelineStage } from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import {
  CountryCoverage as CountryCoverageModel,
  IndustryCoverage as IndustryCoverageModel,
  ProductCoverage as ProductCoverageModel,
  SourceCoverage as SourceCoverageModel,
  SearchQuery as SearchQueryModel,
  CoverageSnapshot as CoverageSnapshotModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
} from "@/models";
import { COUNTRIES } from "./countries";
import type { SearchType, CoverageBySearchTypeEntry, CoverageSnapshot as CoverageSnapshotType } from "@/models";

/** Seeds one NOT_STARTED CountryCoverage row per globally-known country for a workspace, if not already present — the full addressable universe the coverage page reports against, independent of which countries have actually been queried. */
export async function ensureCountryCoverageSeeded(workspaceId: string): Promise<void> {
  await dbConnect();
  const existing = await CountryCoverageModel.find({ workspaceId }, { countryCode: 1 });
  const existingCodes = new Set(existing.map((c) => c.countryCode as string));

  const toInsert = COUNTRIES.filter((c) => !existingCodes.has(c.code)).map((c) => ({
    workspaceId,
    countryCode: c.code,
    countryName: c.name,
    status: "NOT_STARTED" as const,
  }));

  if (toInsert.length > 0) {
    await CountryCoverageModel.insertMany(toInsert, { ordered: false });
  }
}

/**
 * Recomputes CountryCoverage/IndustryCoverage/ProductCoverage rows from the
 * workspace's current SearchQuery rows: a dimension value with at least one
 * query moves from NOT_STARTED to QUEUED (never back down), and its
 * queriesTotal/queriesCompleted counts are refreshed. Nothing here marks
 * anything COVERED/FAILED — that requires actually running a search, which
 * this phase doesn't do.
 */
export async function refreshDimensionCoverage(workspaceId: string): Promise<void> {
  await dbConnect();
  const queries = await SearchQueryModel.find({ workspaceId });

  const byCountry = new Map<string, { total: number; completed: number }>();
  const byIndustry = new Map<string, { total: number; completed: number }>();
  const byProduct = new Map<string, { total: number; completed: number }>();

  for (const q of queries) {
    const isCompleted = q.status !== "QUEUED" && q.status !== "NOT_STARTED";

    if (q.country) {
      const entry = byCountry.get(q.country) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (isCompleted) entry.completed += 1;
      byCountry.set(q.country, entry);
    }
    if (q.industry) {
      const entry = byIndustry.get(q.industry) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (isCompleted) entry.completed += 1;
      byIndustry.set(q.industry, entry);
    }
    if (q.productServiceId) {
      const entry = byProduct.get(q.productServiceId) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (isCompleted) entry.completed += 1;
      byProduct.set(q.productServiceId, entry);
    }
  }

  // Plain read-then-write rather than a pipeline upsert: Mongo's upsert only
  // auto-applies filter fields (workspaceId, industry, ...) to a newly
  // inserted document for plain `{ $set }` updates, not aggregation-pipeline
  // updates — this way every field is set explicitly regardless of path.
  await Promise.all(
    [...byCountry.entries()].map(async ([countryCode, stats]) => {
      const existing = await CountryCoverageModel.findOne({ workspaceId, countryCode });
      if (!existing) return; // countries are pre-seeded by ensureCountryCoverageSeeded; nothing to do if missing
      await CountryCoverageModel.updateOne(
        { workspaceId, countryCode },
        {
          queriesTotal: stats.total,
          queriesCompleted: stats.completed,
          status: existing.status === "NOT_STARTED" ? "QUEUED" : existing.status,
        },
      );
    }),
  );

  await Promise.all(
    [...byIndustry.entries()].map(async ([industry, stats]) => {
      const existing = await IndustryCoverageModel.findOne({ workspaceId, industry });
      await IndustryCoverageModel.updateOne(
        { workspaceId, industry },
        {
          workspaceId,
          industry,
          queriesTotal: stats.total,
          queriesCompleted: stats.completed,
          status: !existing || existing.status === "NOT_STARTED" ? "QUEUED" : existing.status,
        },
        { upsert: true },
      );
    }),
  );

  await Promise.all(
    [...byProduct.entries()].map(async ([productServiceId, stats]) => {
      const existing = await ProductCoverageModel.findOne({ workspaceId, productServiceId });
      await ProductCoverageModel.updateOne(
        { workspaceId, productServiceId },
        {
          workspaceId,
          productServiceId,
          queriesTotal: stats.total,
          queriesCompleted: stats.completed,
          status: !existing || existing.status === "NOT_STARTED" ? "QUEUED" : existing.status,
        },
        { upsert: true },
      );
    }),
  );
}

const EMPTY_SEARCH_TYPE_ENTRY: CoverageBySearchTypeEntry = { total: 0, completed: 0 };

/** Rolls up coverage across every dimension into a new CoverageSnapshot row (kept as history) for the Discovery Brain page's summary stats. */
export async function computeCoverageSnapshot(workspaceId: string) {
  await dbConnect();
  const [countries, products, industries, sources, queries] = await Promise.all([
    CountryCoverageModel.find({ workspaceId }),
    ProductCoverageModel.find({ workspaceId }),
    IndustryCoverageModel.find({ workspaceId }),
    SourceCoverageModel.find({ workspaceId }),
    SearchQueryModel.find({ workspaceId }, { searchType: 1, status: 1 }),
  ]);

  const countriesSearched = countries.filter((c) => c.status === "COVERED").length;
  const countriesPending = countries.filter((c) => c.status === "NOT_STARTED" || c.status === "QUEUED").length;
  const countriesNeedingRefresh = countries.filter((c) => c.status === "NEEDS_REFRESH").length;
  const productsSearched = products.filter((p) => p.status === "COVERED").length;
  const industriesSearched = industries.filter((i) => i.status === "COVERED").length;
  const sourcesSearched = sources.filter((s) => s.status === "COVERED").length;
  const sourcesPending = sources.filter((s) => s.status === "NOT_STARTED" || s.status === "QUEUED").length;

  const bySearchType: Partial<Record<SearchType, CoverageBySearchTypeEntry>> = {};
  for (const q of queries) {
    if (!q.searchType) continue;
    const entry = bySearchType[q.searchType as SearchType] ?? { ...EMPTY_SEARCH_TYPE_ENTRY };
    entry.total += 1;
    if (q.status !== "QUEUED" && q.status !== "NOT_STARTED") entry.completed += 1;
    bySearchType[q.searchType as SearchType] = entry;
  }

  const totalDimensions = countries.length + products.length + industries.length + sources.length;
  const coveredDimensions =
    countries.filter((c) => c.status === "COVERED").length +
    products.filter((p) => p.status === "COVERED").length +
    industries.filter((i) => i.status === "COVERED").length +
    sources.filter((s) => s.status === "COVERED").length;
  const coveragePercentage = totalDimensions === 0 ? 0 : Math.round((coveredDimensions / totalDimensions) * 100);

  const snapshot = await CoverageSnapshotModel.create({
    workspaceId,
    countriesSearched,
    countriesPending,
    countriesNeedingRefresh,
    productsSearched,
    industriesSearched,
    sourcesSearched,
    sourcesPending,
    coveragePercentage,
    bySearchType,
  });

  return snapshot.toObject() as CoverageSnapshotType;
}

/** Latest coverage snapshot for the Discovery Brain page — null if none has been computed yet. */
export async function getLatestCoverageSnapshot(workspaceId: string): Promise<CoverageSnapshotType | null> {
  await dbConnect();
  const snapshot = await CoverageSnapshotModel.findOne({ workspaceId }).sort({ capturedAt: -1 });
  return snapshot ? (snapshot.toObject() as CoverageSnapshotType) : null;
}

/** Per-country coverage rows for the Coverage page's detail table, only-searched countries first then alphabetical. */
export async function listCountryCoverage(workspaceId: string) {
  await dbConnect();
  const rows = await CountryCoverageModel.find({ workspaceId }).sort({ status: 1, countryName: 1 });
  return rows.map((r) => r.toObject());
}

export async function listIndustryCoverage(workspaceId: string) {
  await dbConnect();
  const rows = await IndustryCoverageModel.find({ workspaceId }).sort({ industry: 1 });
  return rows.map((r) => r.toObject());
}

export async function listProductCoverage(workspaceId: string) {
  await dbConnect();
  const rows = await ProductCoverageModel.find({ workspaceId }).sort({ createdAt: 1 });
  return rows.map((r) => r.toObject());
}

export async function listSourceCoverage(workspaceId: string) {
  await dbConnect();
  const rows = await SourceCoverageModel.find({ workspaceId }).sort({ createdAt: 1 });
  return rows.map((r) => r.toObject());
}

export type EntityCountsByCountryRow = {
  country: string;
  customers: number;
  projects: number;
  tenderBuyers: number;
  liveTenders: number;
  vendorRegistrations: number;
};

async function countByCountry(Model: { aggregate: (pipeline: PipelineStage[]) => Promise<unknown> }, workspaceId: string): Promise<Map<string, number>> {
  const rows = (await Model.aggregate([
    { $match: { workspaceId, country: { $nin: [null, ""] } } },
    { $group: { _id: "$country", count: { $sum: 1 } } },
  ])) as { _id: string; count: number }[];
  return new Map(rows.map((r) => [r._id, r.count]));
}

/** Merges per-country discovered-record counts across every entity type (customers/projects/tender buyers/live tenders/vendor registrations) into one table for the Coverage page — one row per country that has at least one discovered record in any of them. */
export async function getEntityCountsByCountry(workspaceId: string): Promise<EntityCountsByCountryRow[]> {
  await dbConnect();

  const [customers, projects, tenderBuyers, liveTenders, vendorRegistrations] = await Promise.all([
    countByCountry(TargetCustomerModel, workspaceId),
    countByCountry(ProjectOpportunityModel, workspaceId),
    countByCountry(TenderBuyerModel, workspaceId),
    countByCountry(TenderOpportunityModel, workspaceId),
    countByCountry(VendorRegistrationModel, workspaceId),
  ]);

  const countries = new Set([...customers.keys(), ...projects.keys(), ...tenderBuyers.keys(), ...liveTenders.keys(), ...vendorRegistrations.keys()]);

  return [...countries]
    .map((country) => ({
      country,
      customers: customers.get(country) ?? 0,
      projects: projects.get(country) ?? 0,
      tenderBuyers: tenderBuyers.get(country) ?? 0,
      liveTenders: liveTenders.get(country) ?? 0,
      vendorRegistrations: vendorRegistrations.get(country) ?? 0,
    }))
    .sort((a, b) => b.customers + b.projects + b.tenderBuyers + b.liveTenders + b.vendorRegistrations - (a.customers + a.projects + a.tenderBuyers + a.liveTenders + a.vendorRegistrations));
}
