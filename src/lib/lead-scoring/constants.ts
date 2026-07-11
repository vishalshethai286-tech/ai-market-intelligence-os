/** Each factor's contribution to the composite 0-100 score. Must sum to 1. */
export const SCORING_WEIGHTS = {
  productMatch: 0.2,
  industryMatch: 0.15,
  buyerTypeMatch: 0.1,
  countryMatch: 0.1,
  sourceQuality: 0.1,
  contactAvailability: 0.1,
  similarityToGoodLeads: 0.15,
  brainFeedback: 0.1,
} as const;

/** priorityScore -> priorityGrade thresholds. A+ 85-100, A 70-84, B 50-69, C below 50. */
export const GRADE_THRESHOLDS = {
  A_PLUS: 85,
  A: 70,
  B: 50,
} as const;
