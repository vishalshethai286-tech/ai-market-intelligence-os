import { TENDER_SCORING_WEIGHTS, TENDER_PRIORITY_THRESHOLDS } from "./constants";
import type { TenderOpportunityPriority } from "@/models";

/** The candidate/result fields the scorer actually reads — decoupled from TenderCandidate/RawSearchResult so this stays a pure function. */
export type ScorableTenderCandidate = {
  matchedProductServiceName: string;
  buyerOrganization: string;
  tenderTitle: string;
  tenderDescription: string;
  country: string;
  /** ISO date string, or empty if unknown. */
  endDate: string;
  confidenceScore: number;
  hasSnippet: boolean;
  isMockProvider: boolean;
};

export type TenderScoringContext = {
  /** Our current PRODUCT_OR_SERVICE / TARGET_INDUSTRY / COUNTRY_SERVED Business Brain facts. */
  products: string[];
  targetIndustries: string[];
  countriesServed: string[];
  /** The tender's own inferred industry, if the extractor produced one — kept separate from productMatch/buyerOrgClarity since a tender candidate doesn't carry an explicit "industry" field the way a project does. */
  tenderIndustry?: string;
};

export type TenderScoreBreakdown = {
  productMatch: number;
  industryMatch: number;
  buyerOrgClarity: number;
  titleDescriptionClarity: number;
  countryMatch: number;
  endDateAvailability: number;
  stillActive: number;
  sourceQuality: number;
  confidenceScore: number;
  totalScore: number;
  priority: TenderOpportunityPriority;
  explanation: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** 100 for an exact match against something we know about, 40 for a real-but-unconfirmed value, 0 if empty. */
function fieldMatchScore(value: string, knownValues: string[]): number {
  const normalized = normalize(value);
  if (!normalized) return 0;
  if (knownValues.some((known) => normalize(known) === normalized)) return 100;
  return 40;
}

function presenceScore(value: string): number {
  return value.trim() ? 100 : 0;
}

/** 100 if title AND description are both present, 50 for just one, 0 for neither. */
function titleDescriptionClarityScore(tenderTitle: string, tenderDescription: string): number {
  const count = (tenderTitle.trim() ? 1 : 0) + (tenderDescription.trim() ? 1 : 0);
  return count === 2 ? 100 : count === 1 ? 50 : 0;
}

/** 100 if the end date is in the future or unknown (no penalty for "not yet stated"), 0 only if explicitly in the past — an expired tender is a real, known-bad signal, unlike a missing date. */
function stillActiveScore(endDate: string): number {
  if (!endDate) return 100;
  const parsed = new Date(endDate);
  if (Number.isNaN(parsed.getTime())) return 100;
  return parsed.getTime() >= Date.now() ? 100 : 0;
}

/** Proxy for how trustworthy the source is: has a snippet to corroborate the title (60), and came from a real (non-mock) search provider (40) — same heuristic as customer/project scoring. */
function sourceQualityScore(hasSnippet: boolean, isMockProvider: boolean): number {
  return (hasSnippet ? 60 : 0) + (isMockProvider ? 0 : 40);
}

export function scoreToTenderPriority(totalScore: number): TenderOpportunityPriority {
  if (totalScore >= TENDER_PRIORITY_THRESHOLDS.A_PLUS) return "A_PLUS";
  if (totalScore >= TENDER_PRIORITY_THRESHOLDS.A) return "A";
  if (totalScore >= TENDER_PRIORITY_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * Computes a tender opportunity candidate's 0-100 score across every factor
 * and converts it to a priority grade. Pure function — no DB access — the
 * processor is responsible for assembling TenderScoringContext.
 */
export function computeTenderScore(candidate: ScorableTenderCandidate, context: TenderScoringContext): TenderScoreBreakdown {
  const productMatch = fieldMatchScore(candidate.matchedProductServiceName, context.products);
  const industryMatch = fieldMatchScore(context.tenderIndustry ?? "", context.targetIndustries);
  const buyerOrgClarity = presenceScore(candidate.buyerOrganization);
  const titleDescriptionClarity = titleDescriptionClarityScore(candidate.tenderTitle, candidate.tenderDescription);
  const countryMatch = fieldMatchScore(candidate.country, context.countriesServed);
  const endDateAvailability = presenceScore(candidate.endDate);
  const stillActive = stillActiveScore(candidate.endDate);
  const sourceQuality = sourceQualityScore(candidate.hasSnippet, candidate.isMockProvider);
  const confidenceScore = Math.min(100, Math.max(0, candidate.confidenceScore * 100));

  const totalScore =
    productMatch * TENDER_SCORING_WEIGHTS.productMatch +
    industryMatch * TENDER_SCORING_WEIGHTS.industryMatch +
    buyerOrgClarity * TENDER_SCORING_WEIGHTS.buyerOrgClarity +
    titleDescriptionClarity * TENDER_SCORING_WEIGHTS.titleDescriptionClarity +
    countryMatch * TENDER_SCORING_WEIGHTS.countryMatch +
    endDateAvailability * TENDER_SCORING_WEIGHTS.endDateAvailability +
    stillActive * TENDER_SCORING_WEIGHTS.stillActive +
    sourceQuality * TENDER_SCORING_WEIGHTS.sourceQuality +
    confidenceScore * TENDER_SCORING_WEIGHTS.confidenceScore;

  const roundedTotal = Math.round(totalScore * 100) / 100;
  const priority = scoreToTenderPriority(roundedTotal);

  return {
    productMatch,
    industryMatch,
    buyerOrgClarity,
    titleDescriptionClarity,
    countryMatch,
    endDateAvailability,
    stillActive,
    sourceQuality,
    confidenceScore,
    totalScore: roundedTotal,
    priority,
    explanation: `Scored ${roundedTotal}/100 (priority ${priority}) — product match ${productMatch}, buyer org clarity ${buyerOrgClarity}, still active ${stillActive}.`,
  };
}
