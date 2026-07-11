import { SCORING_WEIGHTS, GRADE_THRESHOLDS } from "./constants";
import type { TargetCompanyPriorityGrade } from "@/generated/prisma/client";

/** The subset of TargetCompany fields the scorer actually reads. */
export type ScorableTargetCompany = {
  id: string;
  companyName: string;
  industry: string | null;
  buyerType: string | null;
  matchedProduct: string | null;
  country: string | null;
  website: string | null;
  confidenceScore: number;
};

/** A previously human-approved target company, used as a "known good lead" reference for similarity scoring. */
export type GoodLeadReference = {
  id: string;
  industry: string | null;
  buyerType: string | null;
  matchedProduct: string | null;
  country: string | null;
};

export type LeadScoringContext = {
  /** Our current PRODUCT_OR_SERVICE / TARGET_INDUSTRY / BUYER_TYPE / COUNTRY_SERVED Business Brain facts. */
  products: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
  /** Other TargetCompany rows in this workspace already marked APPROVED. */
  goodLeadReferences: GoodLeadReference[];
  /** Business Brain GOOD_LEAD/BAD_LEAD feedback counts, keyed by normalized (trimmed, lowercased) company name. */
  feedbackByCompanyKey: Map<string, { good: number; bad: number }>;
};

export type ScoringBreakdown = {
  productMatch: number;
  industryMatch: number;
  buyerTypeMatch: number;
  countryMatch: number;
  sourceQuality: number;
  contactAvailability: number;
  similarityToGoodLeads: number;
  brainFeedback: number;
  totalScore: number;
  grade: TargetCompanyPriorityGrade;
};

function normalize(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Scores how well a target's own field matches something in our known list
 * (a product we offer, an industry/buyer type/country we target): 100 for an
 * exact match, 40 if the target has *a* value but it doesn't match anything
 * we currently know about (partial credit — it's still a real, specific
 * value, just not one we can confirm relevance for), 0 if the field is empty.
 */
function fieldMatchScore(value: string | null, knownValues: string[]): number {
  const normalized = normalize(value);
  if (!normalized) return 0;
  if (knownValues.some((known) => normalize(known) === normalized)) return 100;
  return 40;
}

/** 0-1 extraction confidence scaled to 0-100 — a proxy for how clear/reliable the source was. */
function sourceQualityScore(confidenceScore: number): number {
  return Math.min(100, Math.max(0, confidenceScore * 100));
}

/** A public website is the only contact channel this schema currently captures. */
function contactAvailabilityScore(website: string | null): number {
  return website && website.trim() ? 100 : 0;
}

function fieldsEqual(a: string | null, b: string | null): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 0 && na === nb;
}

/**
 * Best-match similarity (0-100) to any other target company a human has
 * already approved in this workspace — 25 points each for matching
 * industry/buyerType/matchedProduct/country. 0 if there are no approved
 * leads yet to compare against (nothing to be similar to, not evidence of a
 * bad fit). Excludes the target itself from its own reference pool.
 */
function similarityToGoodLeadsScore(target: ScorableTargetCompany, references: GoodLeadReference[]): number {
  let best = 0;
  for (const ref of references) {
    if (ref.id === target.id) continue;
    let score = 0;
    if (fieldsEqual(target.industry, ref.industry)) score += 25;
    if (fieldsEqual(target.buyerType, ref.buyerType)) score += 25;
    if (fieldsEqual(target.matchedProduct, ref.matchedProduct)) score += 25;
    if (fieldsEqual(target.country, ref.country)) score += 25;
    best = Math.max(best, score);
  }
  return best;
}

/**
 * 0-100 from net Business Brain GOOD_LEAD/BAD_LEAD feedback tied to this
 * company by name. No feedback at all scores 50 (neutral — genuinely
 * unknown, unlike the 0 given to an objectively-missing match field above).
 * Each net positive/negative feedback event shifts the score by 25, clamped.
 */
function brainFeedbackScore(companyName: string, feedbackByCompanyKey: Map<string, { good: number; bad: number }>): number {
  const counts = feedbackByCompanyKey.get(normalize(companyName));
  if (!counts) return 50;
  const net = counts.good - counts.bad;
  return Math.min(100, Math.max(0, 50 + net * 25));
}

export function scoreToGrade(totalScore: number): TargetCompanyPriorityGrade {
  if (totalScore >= GRADE_THRESHOLDS.A_PLUS) return "A_PLUS";
  if (totalScore >= GRADE_THRESHOLDS.A) return "A";
  if (totalScore >= GRADE_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * Computes a target company's lead score across all 8 factors and converts
 * it to a grade. Pure function — no DB/network access — so the caller is
 * responsible for assembling `LeadScoringContext` and persisting the result.
 */
export function computeLeadScore(target: ScorableTargetCompany, context: LeadScoringContext): ScoringBreakdown {
  const productMatch = fieldMatchScore(target.matchedProduct, context.products);
  const industryMatch = fieldMatchScore(target.industry, context.targetIndustries);
  const buyerTypeMatch = fieldMatchScore(target.buyerType, context.buyerTypes);
  const countryMatch = fieldMatchScore(target.country, context.countriesServed);
  const sourceQuality = sourceQualityScore(target.confidenceScore);
  const contactAvailability = contactAvailabilityScore(target.website);
  const similarityToGoodLeads = similarityToGoodLeadsScore(target, context.goodLeadReferences);
  const brainFeedback = brainFeedbackScore(target.companyName, context.feedbackByCompanyKey);

  const totalScore =
    productMatch * SCORING_WEIGHTS.productMatch +
    industryMatch * SCORING_WEIGHTS.industryMatch +
    buyerTypeMatch * SCORING_WEIGHTS.buyerTypeMatch +
    countryMatch * SCORING_WEIGHTS.countryMatch +
    sourceQuality * SCORING_WEIGHTS.sourceQuality +
    contactAvailability * SCORING_WEIGHTS.contactAvailability +
    similarityToGoodLeads * SCORING_WEIGHTS.similarityToGoodLeads +
    brainFeedback * SCORING_WEIGHTS.brainFeedback;

  const roundedTotal = Math.round(totalScore * 100) / 100;

  return {
    productMatch,
    industryMatch,
    buyerTypeMatch,
    countryMatch,
    sourceQuality,
    contactAvailability,
    similarityToGoodLeads,
    brainFeedback,
    totalScore: roundedTotal,
    grade: scoreToGrade(roundedTotal),
  };
}
