/** Max RawSearchResult rows processed in a single processProjectResults() call — keeps one batch bounded regardless of backlog size. */
export const DEFAULT_PROCESSING_BATCH_SIZE = 25;
export const MAX_PROCESSING_BATCH_SIZE = 100;

/**
 * Each factor's contribution to the composite 0-100 score. Weights sum to 1.
 * Mirrors src/lib/customers/constants.ts's shape, with project-specific
 * factors (stage, timeline clarity, contractor visibility, tender
 * likelihood) replacing the customer-specific ones.
 */
export const PROJECT_SCORING_WEIGHTS = {
  productMatch: 0.15,
  industryMatch: 0.15,
  countryMatch: 0.1,
  projectStage: 0.15,
  timelineClarity: 0.05,
  contractorVisibility: 0.1,
  clientClarity: 0.1,
  sourceQuality: 0.1,
  tenderLikelihood: 0.05,
  confidenceScore: 0.05,
} as const;

/** score -> priority thresholds. A+ 85-100, A 70-84, B 50-69, C below 50 — same thresholds as customer scoring. */
export const PROJECT_PRIORITY_THRESHOLDS = {
  A_PLUS: 85,
  A: 70,
  B: 50,
} as const;

/** 0-100 relevance-weighted score per project stage — tender/awarded/FEED score highest (imminent procurement need), operational lowest (opportunity has likely passed). */
export const PROJECT_STAGE_SCORES: Record<string, number> = {
  TENDER: 100,
  AWARDED: 100,
  FEED: 90,
  CONSTRUCTION: 75,
  PLANNING: 60,
  ANNOUNCED: 55,
  UNKNOWN: 30,
  OPERATIONAL: 20,
};

/** 0-100 estimate of how close a project is to (or already at) a tender/procurement event — distinct from PROJECT_STAGE_SCORES, which scores general relevance-by-stage rather than tender proximity specifically. */
export const TENDER_LIKELIHOOD_BY_STAGE: Record<string, number> = {
  TENDER: 100,
  AWARDED: 80,
  FEED: 70,
  PLANNING: 50,
  CONSTRUCTION: 40,
  ANNOUNCED: 30,
  UNKNOWN: 20,
  OPERATIONAL: 10,
};
