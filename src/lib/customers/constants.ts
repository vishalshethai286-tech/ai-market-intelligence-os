/** Max RawSearchResult rows processed in a single processCustomerResults() call — keeps one batch bounded regardless of backlog size. */
export const DEFAULT_PROCESSING_BATCH_SIZE = 25;
export const MAX_PROCESSING_BATCH_SIZE = 100;

/**
 * Each factor's contribution to the composite 0-100 score. `brainFeedback` is
 * a placeholder for a future feedback loop (Task 9's Mark Good/Bad Fit
 * actions record BrainFeedback today, but nothing feeds it back into scoring
 * yet) — kept at weight 0 so it's visible in the breakdown without affecting
 * the total. Non-zero weights sum to 1.
 */
export const CUSTOMER_SCORING_WEIGHTS = {
  productMatch: 0.2,
  industryMatch: 0.15,
  buyerTypeMatch: 0.1,
  countryMatch: 0.1,
  websiteAvailability: 0.1,
  addressPhoneAvailability: 0.05,
  sourceQuality: 0.1,
  confidenceScore: 0.1,
  similarityToApprovedBuyerTypes: 0.1,
  brainFeedback: 0,
} as const;

/** score -> priority thresholds. A+ 85-100, A 70-84, B 50-69, C below 50. */
export const CUSTOMER_PRIORITY_THRESHOLDS = {
  A_PLUS: 85,
  A: 70,
  B: 50,
} as const;
