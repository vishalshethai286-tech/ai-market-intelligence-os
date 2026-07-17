import * as z from "zod";

/**
 * Shape of a single RawSearchResult's vendor-registration assessment,
 * validated against the JSON Schema given to Claude (real path) or produced
 * directly by the mock. Unlike tenders, one result here describes at most
 * one thing — a vendor/supplier registration opportunity — so there's no
 * extractionType dispatch.
 */
export const VendorRegistrationCandidateSchema = z.object({
  isRelevant: z.boolean(),
  customerName: z.string(),
  country: z.string(),
  address: z.string(),
  phoneNumber: z.string(),
  website: z.string(),
  vendorRegistrationLink: z.string(),
  registrationType: z.string(),
  requiredDocuments: z.array(z.string()),
  matchedProductServiceName: z.string(),
  aiVendorRegistrationExplanation: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type VendorRegistrationCandidate = z.infer<typeof VendorRegistrationCandidateSchema>;
