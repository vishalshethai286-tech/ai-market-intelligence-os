/** Max RawSearchResult rows processed in a single processTenderResults() call — keeps one batch bounded regardless of backlog size. */
export const DEFAULT_PROCESSING_BATCH_SIZE = 25;
export const MAX_PROCESSING_BATCH_SIZE = 100;

/** Each factor's contribution to TenderOpportunity's composite 0-100 score. Weights sum to 1. */
export const TENDER_SCORING_WEIGHTS = {
  productMatch: 0.2,
  industryMatch: 0.15,
  buyerOrgClarity: 0.1,
  titleDescriptionClarity: 0.1,
  countryMatch: 0.1,
  endDateAvailability: 0.1,
  stillActive: 0.1,
  sourceQuality: 0.1,
  confidenceScore: 0.05,
} as const;

/** priorityScore -> priority thresholds. A+ 85-100, A 70-84, B 50-69, C below 50 — same thresholds as customer/project scoring. */
export const TENDER_PRIORITY_THRESHOLDS = {
  A_PLUS: 85,
  A: 70,
  B: 50,
} as const;
