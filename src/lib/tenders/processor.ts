import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  RawSearchResult as RawSearchResultModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  ProductService as ProductServiceModel,
} from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { extractTenderCandidateAI } from "@/lib/ai-extraction";
import { computeTenderScore } from "./scoring";
import type { ScorableTenderCandidate } from "./scoring";
import {
  buildTenderBuyerDuplicateKey,
  buildTenderOpportunityDuplicateKey,
  detectExistingTenderBuyer,
  detectExistingTenderOpportunity,
} from "./duplicate";
import { DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE } from "./constants";
import { checkTenderBuyerForDuplicates } from "@/lib/dedup/tender-buyer-service";
import { checkTenderOpportunityForDuplicates } from "@/lib/dedup/tender-opportunity-service";
import { normalizeDomain } from "@/lib/dedup/normalize";
import { checkUsageLimit } from "@/lib/billing/usage";
import type { TenderExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, RawSearchResult } from "@/models";

export type ProcessTenderResultsOptions = {
  batchSize?: number;
  country?: string;
  discoveryRunId?: string;
};

export type ProcessTenderResultsSummary = {
  rawResultsProcessed: number;
  tenderBuyersCreated: number;
  tenderBuyersUpdated: number;
  tenderOpportunitiesCreated: number;
  tenderOpportunitiesUpdated: number;
  skipped: number;
  failed: number;
  duplicatesFound: number;
  autoMerged: number;
  pendingReview: number;
  /** True when the batch didn't run at all because the workspace's plan is already at its TenderBuyer or TenderOpportunity limit (checked once per batch) — see customers/processor.ts's identical field for the full rationale. */
  limitReached: boolean;
};

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Builds the AI-extraction and scoring context once per batch, from the Business Brain + approved product catalog — same shape as customers/projects processor.ts's buildProcessingContext. */
async function buildProcessingContext(workspaceId: string) {
  const [facts, approvedProducts] = await Promise.all([
    listBrainFacts(workspaceId),
    ProductServiceModel.find({ workspaceId, status: "APPROVED" }, { name: 1 }),
  ]);

  const extractionContext: TenderExtractionContext = {
    companyName: factValues(facts, "COMPANY_NAME")[0] ?? "",
    industry: factValues(facts, "INDUSTRY")[0] ?? "",
    businessDescription: factValues(facts, "BUSINESS_DESCRIPTION")[0] ?? "",
    productChoices: approvedProducts.map((p) => p.name as string),
    targetIndustries: factValues(facts, "TARGET_INDUSTRY"),
    buyerTypes: factValues(facts, "BUYER_TYPE"),
    countriesServed: factValues(facts, "COUNTRY_SERVED"),
  };

  const productIdByName = new Map(approvedProducts.map((p) => [normalize(p.name as string), p.id as string]));

  return { extractionContext, productIdByName };
}

/**
 * Converts raw tender search results into structured TenderBuyer and/or
 * TenderOpportunity records. Reads unprocessed RawSearchResult rows
 * (searchType=TENDER), extracts once per result (the extraction can yield a
 * buyer, an opportunity, both, or neither), then scores + dedup-checks
 * whichever record types were found. One bad result (failed extraction) is
 * logged and skipped, not allowed to abort the whole batch. Mirrors
 * src/lib/customers/processor.ts's shape, generalized for two output models.
 */
export async function processTenderResults(
  workspaceId: string,
  options: ProcessTenderResultsOptions = {},
): Promise<ProcessTenderResultsSummary> {
  await dbConnect();

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE));

  const query: Record<string, unknown> = {
    workspaceId,
    searchType: "TENDER",
    extractionStatus: { $ne: "EXTRACTED" },
    processedStatus: { $in: ["UNPROCESSED", "FAILED"] },
  };
  if (options.country) query.country = options.country;
  if (options.discoveryRunId) query.discoveryRunId = options.discoveryRunId;

  const results = await RawSearchResultModel.find(query).sort({ retrievedAt: 1 }).limit(batchSize);

  const summary: ProcessTenderResultsSummary = {
    rawResultsProcessed: 0,
    tenderBuyersCreated: 0,
    tenderBuyersUpdated: 0,
    tenderOpportunitiesCreated: 0,
    tenderOpportunitiesUpdated: 0,
    skipped: 0,
    failed: 0,
    duplicatesFound: 0,
    autoMerged: 0,
    pendingReview: 0,
    limitReached: false,
  };
  if (results.length === 0) return summary;

  const [buyerUsageCheck, opportunityUsageCheck] = await Promise.all([
    checkUsageLimit(workspaceId, "tender_buyer_created"),
    checkUsageLimit(workspaceId, "live_tender_created"),
  ]);
  if (!buyerUsageCheck.allowed && !opportunityUsageCheck.allowed) {
    return { ...summary, limitReached: true };
  }

  const { extractionContext, productIdByName } = await buildProcessingContext(workspaceId);

  for (const doc of results) {
    const result = doc.toObject() as RawSearchResult;
    doc.processedStatus = "PROCESSING";
    doc.extractionStatus = "PENDING";
    await doc.save();

    let candidate;
    try {
      candidate = await extractTenderCandidateAI(result, extractionContext);
    } catch (error) {
      console.error(`Tender extraction failed for RawSearchResult ${result.id}:`, error);
      doc.processedStatus = "FAILED";
      doc.extractionStatus = "FAILED";
      await doc.save();
      summary.failed += 1;
      continue;
    }

    summary.rawResultsProcessed += 1;

    const wantsBuyer = candidate.extractionType === "TENDER_BUYER" || candidate.extractionType === "BOTH";
    const wantsOpportunity = candidate.extractionType === "TENDER_OPPORTUNITY" || candidate.extractionType === "BOTH";

    if (!candidate.isRelevant || (!wantsBuyer && !wantsOpportunity)) {
      doc.processedStatus = "PROCESSED";
      doc.extractionStatus = "SKIPPED";
      await doc.save();
      summary.skipped += 1;
      continue;
    }

    const sourceHistoryEntry = {
      url: result.url,
      rawSearchResultId: result.id,
      discoveryRunId: result.discoveryRunId,
      retrievedAt: result.retrievedAt,
    };

    if (wantsBuyer && candidate.customerName) {
      const existingMatch = await detectExistingTenderBuyer(
        workspaceId,
        candidate.customerName,
        candidate.country,
        normalizeDomain(candidate.website),
        candidate.tenderWebsiteLink,
      );

      if (existingMatch?.matchType === "STRONG") {
        const existingDoc = await TenderBuyerModel.findById(existingMatch.buyer.id);
        if (existingDoc) {
          if (!existingDoc.country && candidate.country) existingDoc.country = candidate.country;
          if (!existingDoc.address && candidate.address) existingDoc.address = candidate.address;
          if (!existingDoc.phoneNumber && candidate.phoneNumber) existingDoc.phoneNumber = candidate.phoneNumber;
          if (!existingDoc.website && candidate.website) existingDoc.website = candidate.website;
          if (!existingDoc.tenderWebsiteLink && candidate.tenderWebsiteLink) existingDoc.tenderWebsiteLink = candidate.tenderWebsiteLink;
          existingDoc.lastVerifiedAt = new Date();
          existingDoc.sourceHistory = [...existingDoc.sourceHistory, sourceHistoryEntry];
          await existingDoc.save();
          summary.tenderBuyersUpdated += 1;
        }
      } else {
        const created = await TenderBuyerModel.create({
          workspaceId,
          customerName: candidate.customerName,
          country: candidate.country || null,
          address: candidate.address || null,
          phoneNumber: candidate.phoneNumber || null,
          website: candidate.website || null,
          websiteDomain: normalizeDomain(candidate.website) || null,
          tenderWebsiteLink: candidate.tenderWebsiteLink || null,
          sourceUrl: result.url,
          sourceHistory: [sourceHistoryEntry],
          lastVerifiedAt: new Date(),
          status: "NEW",
          duplicateStatus: existingMatch?.matchType === "WEAK" ? "POSSIBLE_DUPLICATE" : "UNIQUE",
          duplicateKey: buildTenderBuyerDuplicateKey(workspaceId, candidate.customerName, candidate.country, normalizeDomain(candidate.website), candidate.tenderWebsiteLink),
          rawSearchResultId: result.id,
          discoveryRunId: result.discoveryRunId,
        });
        summary.tenderBuyersCreated += 1;

        try {
          const dedupResult = await checkTenderBuyerForDuplicates(workspaceId, created.id);
          if (dedupResult.outcome === "AUTO_MERGED") {
            summary.duplicatesFound += 1;
            summary.autoMerged += 1;
          } else if (dedupResult.outcome === "PENDING_REVIEW") {
            summary.duplicatesFound += 1;
            summary.pendingReview += 1;
          }
        } catch (error) {
          console.error(`Duplicate check failed for tender buyer ${created.id}:`, error);
        }
      }
    }

    if (wantsOpportunity && candidate.tenderTitle) {
      const buyerOrganization = candidate.buyerOrganization || candidate.customerName;
      const tenderLink = candidate.tenderLink || result.url;

      const scorable: ScorableTenderCandidate = {
        matchedProductServiceName: candidate.matchedProductServiceName,
        buyerOrganization,
        tenderTitle: candidate.tenderTitle,
        tenderDescription: candidate.tenderDescription,
        country: candidate.country,
        endDate: candidate.endDate,
        confidenceScore: candidate.confidenceScore,
        hasSnippet: Boolean(result.snippet),
        isMockProvider: result.sourceProvider === "MOCK",
      };
      const breakdown = computeTenderScore(scorable, {
        products: extractionContext.productChoices,
        targetIndustries: extractionContext.targetIndustries,
        countriesServed: extractionContext.countriesServed,
      });
      const matchedProductServiceId = productIdByName.get(normalize(candidate.matchedProductServiceName)) ?? null;

      const existingMatch = await detectExistingTenderOpportunity(workspaceId, tenderLink, buyerOrganization, candidate.tenderTitle, candidate.country);

      if (existingMatch?.matchType === "STRONG") {
        const existingDoc = await TenderOpportunityModel.findById(existingMatch.opportunity.id);
        if (existingDoc) {
          if (!existingDoc.customerName && candidate.customerName) existingDoc.customerName = candidate.customerName;
          if (!existingDoc.tenderDescription && candidate.tenderDescription) existingDoc.tenderDescription = candidate.tenderDescription;
          if (!existingDoc.startDate && candidate.startDate) existingDoc.startDate = parseDate(candidate.startDate);
          if (!existingDoc.endDate && candidate.endDate) existingDoc.endDate = parseDate(candidate.endDate);
          if (!existingDoc.country && candidate.country) existingDoc.country = candidate.country;
          if (!existingDoc.matchedProductServiceId && matchedProductServiceId) {
            existingDoc.matchedProductServiceId = matchedProductServiceId;
            existingDoc.matchedProductServiceName = candidate.matchedProductServiceName;
          }
          existingDoc.priorityScore = breakdown.totalScore;
          existingDoc.priority = breakdown.priority;
          existingDoc.lastVerifiedAt = new Date();
          existingDoc.sourceHistory = [...existingDoc.sourceHistory, sourceHistoryEntry];
          await existingDoc.save();
          summary.tenderOpportunitiesUpdated += 1;
        }
      } else {
        const created = await TenderOpportunityModel.create({
          workspaceId,
          customerName: candidate.customerName || null,
          buyerOrganization,
          tenderTitle: candidate.tenderTitle,
          tenderDescription: candidate.tenderDescription || null,
          startDate: parseDate(candidate.startDate),
          endDate: parseDate(candidate.endDate),
          tenderLink,
          country: candidate.country || null,
          productsServicesRequired: candidate.productsServicesRequired,
          matchedProductServiceId,
          matchedProductServiceName: candidate.matchedProductServiceName || null,
          priorityScore: breakdown.totalScore,
          priority: breakdown.priority,
          sourceUrl: result.url,
          sourceHistory: [sourceHistoryEntry],
          status: "NEW",
          lastVerifiedAt: new Date(),
          duplicateStatus: existingMatch?.matchType === "WEAK" ? "POSSIBLE_DUPLICATE" : "UNIQUE",
          duplicateKey: buildTenderOpportunityDuplicateKey(workspaceId, tenderLink, buyerOrganization, candidate.tenderTitle, candidate.country),
          rawSearchResultId: result.id,
          discoveryRunId: result.discoveryRunId,
        });
        summary.tenderOpportunitiesCreated += 1;

        try {
          const dedupResult = await checkTenderOpportunityForDuplicates(workspaceId, created.id);
          if (dedupResult.outcome === "AUTO_MERGED") {
            summary.duplicatesFound += 1;
            summary.autoMerged += 1;
          } else if (dedupResult.outcome === "PENDING_REVIEW") {
            summary.duplicatesFound += 1;
            summary.pendingReview += 1;
          }
        } catch (error) {
          console.error(`Duplicate check failed for tender opportunity ${created.id}:`, error);
        }
      }
    }

    doc.processedStatus = "PROCESSED";
    doc.extractionStatus = "EXTRACTED";
    await doc.save();
  }

  return summary;
}
