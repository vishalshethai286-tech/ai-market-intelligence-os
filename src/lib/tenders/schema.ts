import * as z from "zod";

export const TENDER_EXTRACTION_TYPES = ["TENDER_BUYER", "TENDER_OPPORTUNITY", "BOTH", "NONE"] as const;
export type TenderExtractionType = (typeof TENDER_EXTRACTION_TYPES)[number];

/**
 * Shape of a single RawSearchResult's tender assessment, validated against
 * the JSON Schema given to Claude (real path) or produced directly by the
 * mock. One result can plausibly describe a tender *buyer* (a procurement
 * body/portal), a live tender *opportunity* (a specific bid), both (e.g. a
 * buyer's page listing an open tender), or neither — `extractionType`
 * dispatches which fields the processor actually acts on.
 */
export const TenderCandidateSchema = z.object({
  isRelevant: z.boolean(),
  extractionType: z.enum(TENDER_EXTRACTION_TYPES),
  // Shared / buyer fields
  customerName: z.string(),
  country: z.string(),
  address: z.string(),
  phoneNumber: z.string(),
  website: z.string(),
  tenderWebsiteLink: z.string(),
  // Opportunity fields
  buyerOrganization: z.string(),
  tenderTitle: z.string(),
  tenderDescription: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  tenderLink: z.string(),
  productsServicesRequired: z.array(z.string()),
  matchedProductServiceName: z.string(),
  aiTenderExplanation: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type TenderCandidate = z.infer<typeof TenderCandidateSchema>;
