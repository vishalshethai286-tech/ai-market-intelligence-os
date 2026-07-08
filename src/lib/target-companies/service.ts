import "server-only";
import { prisma } from "@/lib/prisma";
import { search } from "@/lib/search";
import type { SearchProviderName } from "@/lib/search";
import { listSearchQueries } from "@/lib/search-queries/service";
import { getBusinessBrain, listBrainFacts, BrainNotReadyError } from "@/lib/business-brain/service";
import { extractTargetCompanies, TargetExtractionError } from "./extract";
import { MAX_RESULTS_PER_EXTRACTION_BATCH } from "./constants";
import type { TargetExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, TargetCompanyDuplicateStatus } from "@/generated/prisma/client";

export { BrainNotReadyError, TargetExtractionError };
export class NoSearchQueriesError extends Error {}

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

/** Best-effort hostname extraction, tolerant of a bare domain with no scheme. */
function domainFromLooseUrl(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Same-company key: prefer the website's domain, fall back to the company name. */
function normalizeKey(companyName: string, website: string): string {
  const domain = website ? domainFromLooseUrl(website) : "";
  return (domain || companyName).trim().toLowerCase();
}

export function listTargetCompanies(workspaceId: string) {
  return prisma.targetCompany.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }],
  });
}

export type TargetDiscoveryOptions = {
  provider?: SearchProviderName;
  maxResultsPerQuery?: number;
  maxQueries?: number;
};

export type TargetDiscoveryResult = { evaluated: number; created: number; queriesRun: number };

/**
 * Runs every stored SearchQuery for a workspace through the Search Service,
 * assesses each batch of results with Claude (`extractTargetCompanies`), and
 * saves only the companies judged relevant as TargetCompany rows
 * (PENDING_REVIEW, matching the CompanyProfile/ProductService review-gated
 * pattern). A company matching an existing TargetCompany (by website domain,
 * or company name if no website) is still saved but flagged `DUPLICATE`
 * rather than dropped — a human reviewing the queue decides what to do with
 * repeats, this doesn't silently discard a second source for the same lead.
 *
 * A single bad query or failed extraction batch is skipped rather than
 * aborting the whole run — with potentially dozens of queries, one provider
 * hiccup or refusal shouldn't lose everything already found.
 */
export async function discoverAndExtractTargetCompanies(
  workspaceId: string,
  options: TargetDiscoveryOptions = {},
): Promise<TargetDiscoveryResult> {
  const brain = await getBusinessBrain(workspaceId);
  if (!brain || brain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before discovering target companies.");
  }

  const [facts, queries, existing] = await Promise.all([
    listBrainFacts(workspaceId),
    listSearchQueries(workspaceId),
    prisma.targetCompany.findMany({ where: { workspaceId }, select: { companyName: true, website: true } }),
  ]);

  if (queries.length === 0) {
    throw new NoSearchQueriesError("Generate search queries before discovering target companies.");
  }

  const context: TargetExtractionContext = {
    companyName: factValues(facts, "COMPANY_NAME")[0] ?? "",
    industry: factValues(facts, "INDUSTRY")[0] ?? "",
    businessDescription: factValues(facts, "BUSINESS_DESCRIPTION")[0] ?? "",
    products: factValues(facts, "PRODUCT_OR_SERVICE"),
    targetIndustries: factValues(facts, "TARGET_INDUSTRY"),
    buyerTypes: factValues(facts, "BUYER_TYPE"),
    countriesServed: factValues(facts, "COUNTRY_SERVED"),
    keywords: factValues(facts, "KEYWORD"),
    competitors: factValues(facts, "COMPETITOR"),
  };

  const seenKeys = new Set(existing.map((e) => normalizeKey(e.companyName, e.website ?? "")));

  const maxResultsPerQuery = Math.min(
    options.maxResultsPerQuery ?? MAX_RESULTS_PER_EXTRACTION_BATCH,
    MAX_RESULTS_PER_EXTRACTION_BATCH,
  );
  const queriesToRun = options.maxQueries ? queries.slice(0, options.maxQueries) : queries;

  let evaluated = 0;
  let created = 0;
  let queriesRun = 0;

  for (const query of queriesToRun) {
    let results;
    try {
      results = await search(query.query, { provider: options.provider, maxResults: maxResultsPerQuery });
    } catch {
      continue;
    }
    if (results.length === 0) continue;

    let assessments;
    try {
      assessments = await extractTargetCompanies(results, context, context.products);
    } catch {
      continue;
    }

    queriesRun += 1;
    evaluated += assessments.length;

    for (let i = 0; i < assessments.length && i < results.length; i++) {
      const item = assessments[i];
      if (!item.isRelevantTarget || !item.companyName) continue;

      const key = normalizeKey(item.companyName, item.website);
      const duplicateStatus: TargetCompanyDuplicateStatus = seenKeys.has(key) ? "DUPLICATE" : "UNIQUE";
      seenKeys.add(key);

      await prisma.targetCompany.create({
        data: {
          workspaceId,
          companyName: item.companyName,
          website: item.website || null,
          industry: item.industry || null,
          country: item.country || null,
          matchedProduct: item.matchedProduct || null,
          sourceUrl: results[i].url,
          relevanceExplanation: item.relevanceExplanation || null,
          confidenceScore: item.confidenceScore,
          duplicateStatus,
        },
      });
      created += 1;
    }
  }

  return { evaluated, created, queriesRun };
}
