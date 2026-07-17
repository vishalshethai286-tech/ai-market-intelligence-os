import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  RawSearchResult as RawSearchResultModel,
  VendorRegistration as VendorRegistrationModel,
  TargetCustomer as TargetCustomerModel,
  ProductService as ProductServiceModel,
} from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { extractVendorRegistrationCandidateAI } from "@/lib/ai-extraction";
import { buildVendorRegistrationDuplicateKey, detectExistingVendorRegistration, normalizeVendorRegistrationName } from "./duplicate";
import { normalizeDomain } from "@/lib/dedup/normalize";
import { DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE } from "./constants";
import { checkVendorRegistrationForDuplicates } from "@/lib/dedup/vendor-registration-service";
import type { VendorRegistrationExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, RawSearchResult } from "@/models";

export type ProcessVendorRegistrationResultsOptions = {
  batchSize?: number;
  country?: string;
  discoveryRunId?: string;
};

export type ProcessVendorRegistrationResultsSummary = {
  rawResultsProcessed: number;
  vendorRegistrationsCreated: number;
  vendorRegistrationsUpdated: number;
  linkedCustomers: number;
  customersCreated: number;
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

/** Builds the AI-extraction context once per batch, from the Business Brain + approved product catalog — same shape as tenders/processor.ts's buildProcessingContext. */
async function buildProcessingContext(workspaceId: string) {
  const [facts, approvedProducts] = await Promise.all([
    listBrainFacts(workspaceId),
    ProductServiceModel.find({ workspaceId, status: "APPROVED" }, { name: 1 }),
  ]);

  const extractionContext: VendorRegistrationExtractionContext = {
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
 * Looks for an existing TargetCustomer that plausibly matches this vendor
 * registration's buyer (same website domain, or same normalized
 * customerName+country) — if found, it's simply counted as linked (no field
 * mutation, since TargetCustomer isn't owned by this pipeline); if not
 * found and the registration is clearly relevant, creates a new minimal
 * TargetCustomer consistent with the existing customer model's shape.
 */
async function linkOrCreateTargetCustomer(
  workspaceId: string,
  candidate: { customerName: string; country: string; website: string },
  domain: string,
  result: RawSearchResult,
  sourceHistoryEntry: { url: string; rawSearchResultId: string; discoveryRunId: string; retrievedAt: Date },
): Promise<"LINKED" | "CREATED" | "NONE"> {
  if (!candidate.customerName) return "NONE";

  const existing = domain
    ? await TargetCustomerModel.findOne({ workspaceId, websiteDomain: domain })
    : null;
  if (existing) return "LINKED";

  const normalizedName = normalizeVendorRegistrationName(candidate.customerName);
  const nameCandidates = await TargetCustomerModel.find({ workspaceId, country: candidate.country || null });
  const nameMatch = nameCandidates.find((c) => normalizeVendorRegistrationName(c.customerName) === normalizedName);
  if (nameMatch) return "LINKED";

  await TargetCustomerModel.create({
    workspaceId,
    customerName: candidate.customerName,
    country: candidate.country || null,
    website: candidate.website || null,
    websiteDomain: domain || null,
    sourceUrl: result.url,
    sourceHistory: [sourceHistoryEntry],
    status: "NEW",
    duplicateStatus: "UNIQUE",
    rawSearchResultId: result.id,
    discoveryRunId: result.discoveryRunId,
  });
  return "CREATED";
}

/**
 * Converts raw vendor-registration search results into structured
 * VendorRegistration records, and where possible/safe, links or creates a
 * matching TargetCustomer. Reads unprocessed RawSearchResult rows
 * (searchType=VENDOR_REGISTRATION), extracts once per result, then
 * dedup-checks whichever VendorRegistration was found. One bad result
 * (failed extraction) is logged and skipped, not allowed to abort the whole
 * batch. Mirrors src/lib/tenders/processor.ts's shape for a single output model.
 */
export async function processVendorRegistrationResults(
  workspaceId: string,
  options: ProcessVendorRegistrationResultsOptions = {},
): Promise<ProcessVendorRegistrationResultsSummary> {
  await dbConnect();

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_PROCESSING_BATCH_SIZE, MAX_PROCESSING_BATCH_SIZE));

  const query: Record<string, unknown> = {
    workspaceId,
    searchType: "VENDOR_REGISTRATION",
    extractionStatus: { $ne: "EXTRACTED" },
    processedStatus: { $in: ["UNPROCESSED", "FAILED"] },
  };
  if (options.country) query.country = options.country;
  if (options.discoveryRunId) query.discoveryRunId = options.discoveryRunId;

  const results = await RawSearchResultModel.find(query).sort({ retrievedAt: 1 }).limit(batchSize);

  const summary: ProcessVendorRegistrationResultsSummary = {
    rawResultsProcessed: 0,
    vendorRegistrationsCreated: 0,
    vendorRegistrationsUpdated: 0,
    linkedCustomers: 0,
    customersCreated: 0,
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
      candidate = await extractVendorRegistrationCandidateAI(result, extractionContext);
    } catch (error) {
      console.error(`Vendor registration extraction failed for RawSearchResult ${result.id}:`, error);
      doc.processedStatus = "FAILED";
      doc.extractionStatus = "FAILED";
      await doc.save();
      summary.failed += 1;
      continue;
    }

    summary.rawResultsProcessed += 1;

    if (!candidate.isRelevant || !candidate.customerName) {
      doc.processedStatus = "PROCESSED";
      doc.extractionStatus = "SKIPPED";
      await doc.save();
      summary.skipped += 1;
      continue;
    }

    const domain = normalizeDomain(candidate.website);
    const sourceHistoryEntry = {
      url: result.url,
      rawSearchResultId: result.id,
      discoveryRunId: result.discoveryRunId,
      retrievedAt: result.retrievedAt,
    };

    const existingMatch = await detectExistingVendorRegistration(
      workspaceId,
      candidate.customerName,
      candidate.country,
      domain,
      candidate.vendorRegistrationLink,
    );

    const matchedProductServiceId = productIdByName.get(normalize(candidate.matchedProductServiceName)) ?? null;

    if (existingMatch?.matchType === "STRONG") {
      const existingDoc = await VendorRegistrationModel.findById(existingMatch.registration.id);
      if (existingDoc) {
        if (!existingDoc.country && candidate.country) existingDoc.country = candidate.country;
        if (!existingDoc.address && candidate.address) existingDoc.address = candidate.address;
        if (!existingDoc.phoneNumber && candidate.phoneNumber) existingDoc.phoneNumber = candidate.phoneNumber;
        if (!existingDoc.website && candidate.website) existingDoc.website = candidate.website;
        if (!existingDoc.websiteDomain && domain) existingDoc.websiteDomain = domain;
        if (!existingDoc.vendorRegistrationLink && candidate.vendorRegistrationLink) existingDoc.vendorRegistrationLink = candidate.vendorRegistrationLink;
        if (!existingDoc.registrationType && candidate.registrationType) existingDoc.registrationType = candidate.registrationType;
        if (existingDoc.requiredDocuments.length === 0 && candidate.requiredDocuments.length > 0) {
          existingDoc.requiredDocuments = candidate.requiredDocuments;
        }
        if (!existingDoc.matchedProductServiceId && matchedProductServiceId) {
          existingDoc.matchedProductServiceId = matchedProductServiceId;
          existingDoc.matchedProductServiceName = candidate.matchedProductServiceName;
        }
        existingDoc.lastVerifiedAt = new Date();
        existingDoc.sourceHistory = [...existingDoc.sourceHistory, sourceHistoryEntry];
        await existingDoc.save();
        summary.vendorRegistrationsUpdated += 1;
      }
    } else {
      const created = await VendorRegistrationModel.create({
        workspaceId,
        customerName: candidate.customerName,
        country: candidate.country || null,
        address: candidate.address || null,
        phoneNumber: candidate.phoneNumber || null,
        website: candidate.website || null,
        websiteDomain: domain || null,
        vendorRegistrationLink: candidate.vendorRegistrationLink || null,
        registrationType: candidate.registrationType || null,
        requiredDocuments: candidate.requiredDocuments,
        sourceUrl: result.url,
        sourceHistory: [sourceHistoryEntry],
        matchedProductServiceId,
        matchedProductServiceName: candidate.matchedProductServiceName || null,
        lastVerifiedAt: new Date(),
        status: "NEW",
        duplicateStatus: existingMatch?.matchType === "WEAK" ? "POSSIBLE_DUPLICATE" : "UNIQUE",
        duplicateKey: buildVendorRegistrationDuplicateKey(workspaceId, candidate.customerName, candidate.country, domain, candidate.vendorRegistrationLink),
        rawSearchResultId: result.id,
        discoveryRunId: result.discoveryRunId,
      });
      summary.vendorRegistrationsCreated += 1;

      try {
        const dedupResult = await checkVendorRegistrationForDuplicates(workspaceId, created.id);
        if (dedupResult.outcome === "AUTO_MERGED") {
          summary.duplicatesFound += 1;
          summary.autoMerged += 1;
        } else if (dedupResult.outcome === "PENDING_REVIEW") {
          summary.duplicatesFound += 1;
          summary.pendingReview += 1;
        }
      } catch (error) {
        console.error(`Duplicate check failed for vendor registration ${created.id}:`, error);
      }
    }

    try {
      const linkOutcome = await linkOrCreateTargetCustomer(
        workspaceId,
        { customerName: candidate.customerName, country: candidate.country, website: candidate.website },
        domain,
        result,
        sourceHistoryEntry,
      );
      if (linkOutcome === "LINKED") summary.linkedCustomers += 1;
      else if (linkOutcome === "CREATED") summary.customersCreated += 1;
    } catch (error) {
      console.error(`TargetCustomer link/create failed for vendor registration raw result ${result.id}:`, error);
    }

    doc.processedStatus = "PROCESSED";
    doc.extractionStatus = "EXTRACTED";
    await doc.save();
  }

  return summary;
}
