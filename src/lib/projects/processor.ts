import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  RawSearchResult as RawSearchResultModel,
  ProjectOpportunity as ProjectOpportunityModel,
  ProductService as ProductServiceModel,
} from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { extractProjectCandidateAI } from "@/lib/ai-extraction";
import { computeProjectScore } from "./scoring";
import type { ScorableProjectCandidate } from "./scoring";
import { buildProjectDuplicateKey, detectExistingProjectByLink, detectExistingProjectByNameOwnerLocation } from "./duplicate";
import { DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE } from "./constants";
import { checkProjectForDuplicates } from "@/lib/dedup/project-service";
import type { ProjectExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, RawSearchResult } from "@/models";

export type ProcessProjectResultsOptions = {
  batchSize?: number;
  country?: string;
  discoveryRunId?: string;
};

export type ProcessProjectResultsSummary = {
  rawResultsProcessed: number;
  projectsCreated: number;
  projectsUpdated: number;
  skipped: number;
  failed: number;
  duplicatesFound: number;
  autoMerged: number;
  pendingReview: number;
};

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Builds the AI-extraction and scoring context once per batch, from the Business Brain + approved product catalog — same shape as customers/processor.ts's buildProcessingContext. */
async function buildProcessingContext(workspaceId: string) {
  const [facts, approvedProducts] = await Promise.all([
    listBrainFacts(workspaceId),
    ProductServiceModel.find({ workspaceId, status: "APPROVED" }, { name: 1 }),
  ]);

  const extractionContext: ProjectExtractionContext = {
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
 * Converts raw project search results into structured ProjectOpportunity
 * records. Reads unprocessed RawSearchResult rows (searchType=PROJECT),
 * extracts + scores + dedup-checks each one, and creates or updates a
 * ProjectOpportunity accordingly. One bad result (failed extraction) is
 * logged and skipped, not allowed to abort the whole batch. Mirrors
 * src/lib/customers/processor.ts's shape.
 */
export async function processProjectResults(
  workspaceId: string,
  options: ProcessProjectResultsOptions = {},
): Promise<ProcessProjectResultsSummary> {
  await dbConnect();

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE));

  const query: Record<string, unknown> = {
    workspaceId,
    searchType: "PROJECT",
    extractionStatus: { $ne: "EXTRACTED" },
    processedStatus: { $in: ["UNPROCESSED", "FAILED"] },
  };
  if (options.country) query.country = options.country;
  if (options.discoveryRunId) query.discoveryRunId = options.discoveryRunId;

  const results = await RawSearchResultModel.find(query).sort({ retrievedAt: 1 }).limit(batchSize);

  const summary: ProcessProjectResultsSummary = {
    rawResultsProcessed: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    skipped: 0,
    failed: 0,
    duplicatesFound: 0,
    autoMerged: 0,
    pendingReview: 0,
  };
  if (results.length === 0) return summary;

  const { extractionContext, productIdByName } = await buildProcessingContext(workspaceId);

  for (const doc of results) {
    const result = doc.toObject() as RawSearchResult;
    doc.processedStatus = "PROCESSING";
    doc.extractionStatus = "PENDING";
    await doc.save();

    let candidate;
    try {
      candidate = await extractProjectCandidateAI(result, extractionContext);
    } catch (error) {
      console.error(`Project extraction failed for RawSearchResult ${result.id}:`, error);
      doc.processedStatus = "FAILED";
      doc.extractionStatus = "FAILED";
      await doc.save();
      summary.failed += 1;
      continue;
    }

    summary.rawResultsProcessed += 1;

    if (!candidate.isRelevant || !candidate.clientName || !candidate.projectName) {
      doc.processedStatus = "PROCESSED";
      doc.extractionStatus = "SKIPPED";
      await doc.save();
      summary.skipped += 1;
      continue;
    }

    const scorable: ScorableProjectCandidate = {
      industry: candidate.industry,
      matchedProductServiceName: candidate.matchedProductServiceName,
      country: candidate.country,
      contractorName: candidate.contractorName,
      timeline: candidate.timeline,
      clientName: candidate.clientName,
      projectStage: candidate.projectStage,
      confidenceScore: candidate.confidenceScore,
      hasSnippet: Boolean(result.snippet),
      isMockProvider: result.sourceProvider === "MOCK",
    };
    const breakdown = computeProjectScore(scorable, {
      products: extractionContext.productChoices,
      targetIndustries: extractionContext.targetIndustries,
      countriesServed: extractionContext.countriesServed,
    });

    const matchedProductServiceId = productIdByName.get(normalize(candidate.matchedProductServiceName)) ?? null;
    const projectInformationLink = candidate.projectInformationLink || result.url;
    const sourceHistoryEntry = {
      url: result.url,
      rawSearchResultId: result.id,
      discoveryRunId: result.discoveryRunId,
      retrievedAt: result.retrievedAt,
    };

    const existingByLink = await detectExistingProjectByLink(workspaceId, projectInformationLink);

    if (existingByLink) {
      // Same project-information link, same workspace = the same project — update rather than create a duplicate row.
      const existingDoc = await ProjectOpportunityModel.findById(existingByLink.id);
      if (existingDoc) {
        if (!existingDoc.location && candidate.location) existingDoc.location = candidate.location;
        if (!existingDoc.country && candidate.country) existingDoc.country = candidate.country;
        if (!existingDoc.contractorName && candidate.contractorName) existingDoc.contractorName = candidate.contractorName;
        if (!existingDoc.timeline && candidate.timeline) existingDoc.timeline = candidate.timeline;
        if (!existingDoc.industry && candidate.industry) existingDoc.industry = candidate.industry;
        if (!existingDoc.matchedProductServiceId && matchedProductServiceId) {
          existingDoc.matchedProductServiceId = matchedProductServiceId;
          existingDoc.matchedProductServiceName = candidate.matchedProductServiceName;
        }
        if (existingDoc.projectStage === "UNKNOWN" && candidate.projectStage !== "UNKNOWN") {
          existingDoc.projectStage = candidate.projectStage;
        }
        existingDoc.score = breakdown.totalScore;
        existingDoc.priority = breakdown.priority;
        existingDoc.confidenceScore = Math.max(existingDoc.confidenceScore, candidate.confidenceScore);
        existingDoc.lastVerifiedAt = new Date();
        existingDoc.sourceHistory = [...existingDoc.sourceHistory, sourceHistoryEntry];
        await existingDoc.save();
        summary.projectsUpdated += 1;
      }
    } else {
      const possibleDuplicate = await detectExistingProjectByNameOwnerLocation(
        workspaceId,
        candidate.projectName,
        candidate.clientName,
        candidate.location,
      );
      const created = await ProjectOpportunityModel.create({
        workspaceId,
        clientName: candidate.clientName,
        projectName: candidate.projectName,
        location: candidate.location || null,
        country: candidate.country || null,
        contractorName: candidate.contractorName || null,
        timeline: candidate.timeline || null,
        projectInformationLink: projectInformationLink || null,
        industry: candidate.industry || null,
        matchedProductServiceId,
        matchedProductServiceName: candidate.matchedProductServiceName || null,
        projectStage: candidate.projectStage,
        score: breakdown.totalScore,
        priority: breakdown.priority,
        status: "NEW",
        sourceUrl: result.url,
        sourceHistory: [sourceHistoryEntry],
        aiOpportunityExplanation: candidate.aiOpportunityExplanation || null,
        confidenceScore: candidate.confidenceScore,
        lastVerifiedAt: new Date(),
        duplicateStatus: possibleDuplicate ? "POSSIBLE_DUPLICATE" : "UNIQUE",
        duplicateKey: buildProjectDuplicateKey(workspaceId, candidate.projectName, candidate.clientName, candidate.location, projectInformationLink),
        rawSearchResultId: result.id,
        discoveryRunId: result.discoveryRunId,
      });
      summary.projectsCreated += 1;

      // Fuzzy duplicate check beyond the exact link/name+owner+location
      // matching above — may auto-merge this brand-new row into an existing
      // one, or flag a DuplicateRecord for review. Never allowed to fail the
      // batch: a dedup hiccup shouldn't undo an otherwise-successful extraction.
      try {
        const dedupResult = await checkProjectForDuplicates(workspaceId, created.id);
        if (dedupResult.outcome === "AUTO_MERGED") {
          summary.duplicatesFound += 1;
          summary.autoMerged += 1;
        } else if (dedupResult.outcome === "PENDING_REVIEW") {
          summary.duplicatesFound += 1;
          summary.pendingReview += 1;
        }
      } catch (error) {
        console.error(`Duplicate check failed for project ${created.id}:`, error);
      }
    }

    doc.processedStatus = "PROCESSED";
    doc.extractionStatus = "EXTRACTED";
    await doc.save();
  }

  return summary;
}
