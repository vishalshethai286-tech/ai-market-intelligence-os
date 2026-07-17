import * as z from "zod";

/** Shape of a single RawSearchResult's customer-extraction assessment, validated against the JSON Schema given to Claude (real path) or produced directly by the mock. */
export const CustomerCandidateSchema = z.object({
  isRealCompany: z.boolean(),
  isTargetCustomer: z.boolean(),
  customerName: z.string(),
  country: z.string(),
  website: z.string(),
  address: z.string(),
  phoneNumber: z.string(),
  matchedProductServiceName: z.string(),
  matchedIndustry: z.string(),
  buyerType: z.string(),
  aiRelevanceExplanation: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type CustomerCandidate = z.infer<typeof CustomerCandidateSchema>;
