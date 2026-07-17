/** Max ContactActivity rows returned per getContactActivities() call. */
export const DEFAULT_ACTIVITY_PAGE_SIZE = 50;

/** Each factor's contribution to a Contact's composite 0-100 priority score. Weights sum to 1. */
export const CONTACT_SCORING_WEIGHTS = {
  roleRelevance: 0.25,
  seniority: 0.15,
  hasEmail: 0.15,
  hasPhone: 0.1,
  hasLinkedIn: 0.1,
  linkedToApprovedRecord: 0.1,
  sourceQuality: 0.05,
  countryRelevance: 0.05,
  confidenceScore: 0.05,
} as const;

/** priorityScore -> priority thresholds. A+ 85-100, A 70-84, B 50-69, C below 50 — same thresholds as every other scored entity in this codebase. */
export const CONTACT_PRIORITY_THRESHOLDS = {
  A_PLUS: 85,
  A: 70,
  B: 50,
} as const;
