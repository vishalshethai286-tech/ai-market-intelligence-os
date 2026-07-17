import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ProductService, CompanyProfile } from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { OPERATION_TYPE_LABELS } from "@/lib/company-profile/constants";
import { findCountryByName } from "./countries";
import { MAX_INDUSTRIES_PER_PRODUCT, MAX_BUYER_TYPES_PER_PRODUCT, MAX_COUNTRIES_PER_WORKSPACE } from "./constants";
import type { SearchType } from "@/models";

export type PlannedDiscoveryQuery = {
  searchType: SearchType;
  query: string;
  productServiceId: string | null;
  industry: string | null;
  buyerType: string | null;
  country: string | null;
  language: string | null;
};

function cap<T>(values: T[], max: number): T[] {
  return values.slice(0, max);
}

/** Case-insensitive de-dupe that preserves the first-seen casing. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * Enumerates the full candidate discovery-query set for a workspace, using
 * the Business Brain (approved product catalog + facts) as the source of
 * truth — nothing here calls an AI provider or a search engine. Query
 * volume is bounded to the workspace's own target countries/industries/
 * buyer types (not the full global country list — that's what
 * CountryCoverage tracks as the addressable universe, separately from what
 * actually gets queried).
 *
 * Templates follow the exact patterns requested for each search type:
 * customer (6 patterns), project (12, Phase 9), tender (12, Phase 10), vendor registration (12, Phase 11).
 */
export async function planDiscoveryQueries(workspaceId: string): Promise<PlannedDiscoveryQuery[]> {
  await dbConnect();
  const [products, facts, profile] = await Promise.all([
    ProductService.find({ workspaceId, status: { $ne: "REJECTED" } }),
    listBrainFacts(workspaceId),
    CompanyProfile.findOne({ workspaceId }),
  ]);

  const countryNames = cap(
    dedupe(facts.filter((f) => f.factType === "COUNTRY_SERVED").map((f) => f.factValue)),
    MAX_COUNTRIES_PER_WORKSPACE,
  );
  const countries = countryNames.map((name) => {
    const match = findCountryByName(name);
    return { name, code: match?.code ?? null, language: match?.defaultLanguage ?? null };
  });

  const companyType =
    profile && profile.operationType !== "UNKNOWN"
      ? OPERATION_TYPE_LABELS[profile.operationType as keyof typeof OPERATION_TYPE_LABELS]
      : null;

  const planned: PlannedDiscoveryQuery[] = [];

  for (const product of products) {
    const industries = cap(dedupe(product.targetIndustries), MAX_INDUSTRIES_PER_PRODUCT);
    const buyerTypes = cap(dedupe(product.buyerTypes), MAX_BUYER_TYPES_PER_PRODUCT);

    for (const country of countries) {
      const base = {
        productServiceId: product.id,
        country: country.code,
        language: country.language,
      };

      // --- Customer discovery ---
      planned.push({ ...base, searchType: "CUSTOMER", query: `${product.name} companies ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "CUSTOMER", query: `${product.name} manufacturers ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "CUSTOMER", query: `${product.name} importers ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "CUSTOMER", query: `${product.name} distributors ${country.name}`, industry: null, buyerType: null });
      for (const industry of industries) {
        planned.push({ ...base, searchType: "CUSTOMER", query: `${industry} companies ${country.name}`, industry, buyerType: null });
      }
      for (const buyerType of buyerTypes) {
        for (const industry of industries) {
          planned.push({ ...base, searchType: "CUSTOMER", query: `${buyerType} ${industry} ${country.name}`, industry, buyerType });
        }
      }

      // --- Project discovery ---
      planned.push({ ...base, searchType: "PROJECT", query: `${product.name} project ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "PROJECT", query: `${product.name} procurement project ${country.name}`, industry: null, buyerType: null });
      for (const industry of industries) {
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} project announcement ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} plant expansion ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} EPC award ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} EPC contractor awarded ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} new factory ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} construction project ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} environmental approval ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} funding announcement ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} FEED contract ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "PROJECT", query: `${industry} new plant investment ${country.name}`, industry, buyerType: null });
      }

      // --- Tender discovery ---
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} tender ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} procurement ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} RFQ ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} RFP ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} government tender ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "TENDER", query: `${product.name} bid opportunity ${country.name}`, industry: null, buyerType: null });
      for (const industry of industries) {
        planned.push({ ...base, searchType: "TENDER", query: `${industry} tender ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "TENDER", query: `${industry} procurement portal ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "TENDER", query: `${industry} public procurement ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "TENDER", query: `${industry} tender notice ${country.name}`, industry, buyerType: null });
      }
      for (const buyerType of buyerTypes) {
        planned.push({ ...base, searchType: "TENDER", query: `${buyerType} tender ${country.name}`, industry: null, buyerType });
        planned.push({ ...base, searchType: "TENDER", query: `${buyerType} supplier tender ${country.name}`, industry: null, buyerType });
      }

      // --- Vendor registration discovery ---
      planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${product.name} supplier registration ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${product.name} vendor registration ${country.name}`, industry: null, buyerType: null });
      planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${product.name} approved vendor registration ${country.name}`, industry: null, buyerType: null });
      for (const industry of industries) {
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${industry} vendor registration ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${industry} supplier registration ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${industry} supplier portal ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${industry} become a supplier ${country.name}`, industry, buyerType: null });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${industry} procurement supplier portal ${country.name}`, industry, buyerType: null });
      }
      for (const buyerType of buyerTypes) {
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${buyerType} vendor registration ${country.name}`, industry: null, buyerType });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${buyerType} supplier portal ${country.name}`, industry: null, buyerType });
        planned.push({ ...base, searchType: "VENDOR_REGISTRATION", query: `${buyerType} become a vendor ${country.name}`, industry: null, buyerType });
      }
      if (companyType) {
        planned.push({
          ...base,
          searchType: "VENDOR_REGISTRATION",
          query: `${companyType} procurement registration ${country.name}`,
          industry: null,
          buyerType: null,
        });
      }
    }
  }

  return planned;
}
