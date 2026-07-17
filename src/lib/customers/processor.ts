import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  RawSearchResult as RawSearchResultModel,
  TargetCustomer as TargetCustomerModel,
  ProductService as ProductServiceModel,
} from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { extractCustomerCandidateAI } from "@/lib/ai-extraction";
import { computeCustomerScore } from "./scoring";
import type { ApprovedCustomerReference, ScorableCustomerCandidate } from "./scoring";
import {
  normalizeDomain,
  buildCustomerDuplicateKey,
  detectExistingCustomerByDomain,
  detectExistingCustomerByNameCountry,
} from "./duplicate";
import { DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE } from "./constants";
import { checkCustomerForDuplicates } from "@/lib/dedup/customer-service";
import type { CustomerExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, RawSearchResult } from "@/models";

export type ProcessCustomerResultsOptions = {
  batchSize?: number;
  country?: string;
  discoveryRunId?: string;
};

export type ProcessCustomerResultsSummary = {
  rawResultsProcessed: number;
  customersCreated: number;
  customersUpdated: number;
  skipped: number;
  failed: number;
};

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Builds the AI-extraction and scoring context once per batch, from the Business Brain + approved product catalog + already-approved customers (used as "known good buyer" references). */
async function buildProcessingContext(workspaceId: string) {
  const [facts, approvedProducts, approvedCustomers] = await Promise.all([
    listBrainFacts(workspaceId),
    ProductServiceModel.find({ workspaceId, status: "APPROVED" }, { name: 1 }),
    TargetCustomerModel.find(
      { workspaceId, status: "APPROVED" },
      { matchedIndustry: 1, buyerType: 1, matchedProductServiceName: 1, country: 1 },
    ),
  ]);

  const extractionContext: CustomerExtractionContext = {
    companyName: factValues(facts, "COMPANY_NAME")[0] ?? "",
    industry: factValues(facts, "INDUSTRY")[0] ?? "",
    businessDescription: factValues(facts, "BUSINESS_DESCRIPTION")[0] ?? "",
    productChoices: approvedProducts.map((p) => p.name as string),
    targetIndustries: factValues(facts, "TARGET_INDUSTRY"),
    buyerTypes: factValues(facts, "BUYER_TYPE"),
    countriesServed: factValues(facts, "COUNTRY_SERVED"),
  };

  const approvedReferences: ApprovedCustomerReference[] = approvedCustomers.map((c) => ({
    id: c.id as string,
    matchedIndustry: c.matchedIndustry ?? null,
    buyerType: c.buyerType ?? null,
    matchedProductServiceName: c.matchedProductServiceName ?? null,
    country: c.country ?? null,
  }));

  const productIdByName = new Map(approvedProducts.map((p) => [normalize(p.name as string), p.id as string]));

  return { extractionContext, approvedReferences, productIdByName };
}

/**
 * Converts raw customer search results into structured TargetCustomer
 * records. Reads unprocessed RawSearchResult rows (searchType=CUSTOMER),
 * extracts + scores + dedup-checks each one, and creates or updates a
 * TargetCustomer accordingly. One bad result (failed extraction) is logged
 * and skipped, not allowed to abort the whole batch.
 */
export async function processCustomerResults(
  workspaceId: string,
  options: ProcessCustomerResultsOptions = {},
): Promise<ProcessCustomerResultsSummary> {
  await dbConnect();

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE));

  const query: Record<string, unknown> = {
    workspaceId,
    searchType: "CUSTOMER",
    extractionStatus: { $ne: "EXTRACTED" },
    processedStatus: { $in: ["UNPROCESSED", "FAILED"] },
  };
  if (options.country) query.country = options.country;
  if (options.discoveryRunId) query.discoveryRunId = options.discoveryRunId;

  const results = await RawSearchResultModel.find(query).sort({ retrievedAt: 1 }).limit(batchSize);

  const summary: ProcessCustomerResultsSummary = {
    rawResultsProcessed: 0,
    customersCreated: 0,
    customersUpdated: 0,
    skipped: 0,
    failed: 0,
  };
  if (results.length === 0) return summary;

  const { extractionContext, approvedReferences, productIdByName } = await buildProcessingContext(workspaceId);

  for (const doc of results) {
    const result = doc.toObject() as RawSearchResult;
    doc.processedStatus = "PROCESSING";
    doc.extractionStatus = "PENDING";
    await doc.save();

    let candidate;
    try {
      candidate = await extractCustomerCandidateAI(result, extractionContext);
    } catch (error) {
      console.error(`Customer extraction failed for RawSearchResult ${result.id}:`, error);
      doc.processedStatus = "FAILED";
      doc.extractionStatus = "FAILED";
      await doc.save();
      summary.failed += 1;
      continue;
    }

    summary.rawResultsProcessed += 1;

    if (!candidate.isRealCompany || !candidate.isTargetCustomer || !candidate.customerName) {
      doc.processedStatus = "PROCESSED";
      doc.extractionStatus = "SKIPPED";
      await doc.save();
      summary.skipped += 1;
      continue;
    }

    const websiteDomain = normalizeDomain(candidate.website);
    const scorable: ScorableCustomerCandidate = {
      matchedIndustry: candidate.matchedIndustry,
      buyerType: candidate.buyerType,
      matchedProductServiceName: candidate.matchedProductServiceName,
      country: candidate.country,
      website: candidate.website,
      address: candidate.address,
      phoneNumber: candidate.phoneNumber,
      confidenceScore: candidate.confidenceScore,
      hasSnippet: Boolean(result.snippet),
      isMockProvider: result.sourceProvider === "MOCK",
    };
    const breakdown = computeCustomerScore(scorable, {
      products: extractionContext.productChoices,
      targetIndustries: extractionContext.targetIndustries,
      buyerTypes: extractionContext.buyerTypes,
      countriesServed: extractionContext.countriesServed,
      approvedReferences,
    });

    const matchedProductServiceId = productIdByName.get(normalize(candidate.matchedProductServiceName)) ?? null;
    const sourceHistoryEntry = {
      url: result.url,
      rawSearchResultId: result.id,
      discoveryRunId: result.discoveryRunId,
      retrievedAt: result.retrievedAt,
    };

    const existingByDomain = websiteDomain ? await detectExistingCustomerByDomain(workspaceId, websiteDomain) : null;

    if (existingByDomain) {
      // Same domain, same workspace = the same company — update rather than create a duplicate row.
      const existingDoc = await TargetCustomerModel.findById(existingByDomain.id);
      if (existingDoc) {
        if (!existingDoc.address && candidate.address) existingDoc.address = candidate.address;
        if (!existingDoc.phoneNumber && candidate.phoneNumber) existingDoc.phoneNumber = candidate.phoneNumber;
        if (!existingDoc.country && candidate.country) existingDoc.country = candidate.country;
        if (!existingDoc.matchedProductServiceId && matchedProductServiceId) {
          existingDoc.matchedProductServiceId = matchedProductServiceId;
          existingDoc.matchedProductServiceName = candidate.matchedProductServiceName;
        }
        existingDoc.score = breakdown.totalScore;
        existingDoc.priority = breakdown.priority;
        existingDoc.confidenceScore = Math.max(existingDoc.confidenceScore, candidate.confidenceScore);
        existingDoc.lastVerifiedAt = new Date();
        existingDoc.sourceHistory = [...existingDoc.sourceHistory, sourceHistoryEntry];
        await existingDoc.save();
        summary.customersUpdated += 1;
      }
    } else {
      const possibleDuplicate = await detectExistingCustomerByNameCountry(workspaceId, candidate.customerName, candidate.country);
      const created = await TargetCustomerModel.create({
        workspaceId,
        customerName: candidate.customerName,
        country: candidate.country || null,
        website: candidate.website || null,
        websiteDomain: websiteDomain || null,
        address: candidate.address || null,
        phoneNumber: candidate.phoneNumber || null,
        score: breakdown.totalScore,
        priority: breakdown.priority,
        status: "NEW",
        sourceUrl: result.url,
        sourceHistory: [sourceHistoryEntry],
        matchedProductServiceId,
        matchedProductServiceName: candidate.matchedProductServiceName || null,
        matchedIndustry: candidate.matchedIndustry || null,
        buyerType: candidate.buyerType || null,
        aiRelevanceExplanation: candidate.aiRelevanceExplanation || null,
        confidenceScore: candidate.confidenceScore,
        lastVerifiedAt: new Date(),
        duplicateStatus: possibleDuplicate ? "POSSIBLE_DUPLICATE" : "UNIQUE",
        duplicateKey: buildCustomerDuplicateKey(workspaceId, candidate.customerName, candidate.country, websiteDomain),
        rawSearchResultId: result.id,
        discoveryRunId: result.discoveryRunId,
      });
      summary.customersCreated += 1;

      // Fuzzy duplicate check (Phase 8) beyond the exact domain/name+country
      // matching above — may auto-merge this brand-new row into an existing
      // one, or flag a DuplicateRecord for review. Never allowed to fail the
      // batch: a dedup hiccup shouldn't undo an otherwise-successful extraction.
      try {
        await checkCustomerForDuplicates(workspaceId, created.id);
      } catch (error) {
        console.error(`Duplicate check failed for customer ${created.id}:`, error);
      }
    }

    doc.processedStatus = "PROCESSED";
    doc.extractionStatus = "EXTRACTED";
    await doc.save();
  }

  return summary;
}
