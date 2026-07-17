import * as z from "zod";

/** Shape of a single RawSearchResult's project-extraction assessment, validated against the JSON Schema given to Claude (real path) or produced directly by the mock. */
export const ProjectCandidateSchema = z.object({
  isRelevant: z.boolean(),
  clientName: z.string(),
  projectName: z.string(),
  location: z.string(),
  country: z.string(),
  contractorName: z.string(),
  timeline: z.string(),
  projectInformationLink: z.string(),
  industry: z.string(),
  matchedProductServiceName: z.string(),
  projectStage: z.enum(["ANNOUNCED", "PLANNING", "FEED", "TENDER", "AWARDED", "CONSTRUCTION", "OPERATIONAL", "UNKNOWN"]),
  aiOpportunityExplanation: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type ProjectCandidate = z.infer<typeof ProjectCandidateSchema>;
