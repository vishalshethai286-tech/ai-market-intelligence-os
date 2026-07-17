import { CUSTOMER_SCORING_WEIGHTS, CUSTOMER_PRIORITY_THRESHOLDS } from "./constants";
import type { TargetCustomerPriority } from "@/models";

/** The candidate/result fields the scorer actually reads — decoupled from CustomerCandidate/RawSearchResult so this stays a pure function. */
export type ScorableCustomerCandidate = {
  matchedIndustry: string;
  buyerType: string;
  matchedProductServiceName: string;
  country: string;
  website: string;
  address: string;
  phoneNumber: string;
  confidenceScore: number;
  hasSnippet: boolean;
  isMockProvider: boolean;
};

/** A previously human-approved TargetCustomer, used as a "known good buyer" reference for similarity scoring — same idea as lead-scoring's GoodLeadReference. */
export type ApprovedCustomerReference = {
  id: string;
  matchedIndustry: string | null;
  buyerType: string | null;
  matchedProductServiceName: string | null;
  country: string | null;
};

export type CustomerScoringContext = {
  /** Our current PRODUCT_OR_SERVICE / TARGET_INDUSTRY / BUYER_TYPE / COUNTRY_SERVED Business Brain facts. */
  products: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
  approvedReferences: ApprovedCustomerReference[];
};

export type CustomerScoreBreakdown = {
  productMatch: number;
  industryMatch: number;
  buyerTypeMatch: number;
  countryMatch: number;
  websiteAvailability: number;
  addressPhoneAvailability: number;
  sourceQuality: number;
  confidenceScore: number;
  similarityToApprovedBuyerTypes: number;
  brainFeedback: number;
  totalScore: number;
  priority: TargetCustomerPriority;
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

/** Website (34) + phone (33) + address (33) — partial credit for whichever public contact details are available. */
function addressPhoneAvailabilityScore(address: string, phoneNumber: string): number {
  return (address.trim() ? 50 : 0) + (phoneNumber.trim() ? 50 : 0);
}

/** Proxy for how trustworthy the source is: has a snippet to corroborate the title (60), and came from a real (non-mock) search provider (40). */
function sourceQualityScore(hasSnippet: boolean, isMockProvider: boolean): number {
  return (hasSnippet ? 60 : 0) + (isMockProvider ? 0 : 40);
}

function fieldsEqual(a: string, b: string | null): boolean {
  const na = normalize(a);
  const nb = normalize(b ?? "");
  return na.length > 0 && na === nb;
}

/**
 * Best-match similarity (0-100) to any TargetCustomer a human has already
 * approved in this workspace — 25 points each for matching industry/
 * buyerType/matchedProductServiceName/country against the closest approved
 * reference. 0 if there are no approved customers yet to compare against.
 */
function similarityToApprovedScore(
  candidate: ScorableCustomerCandidate,
  references: ApprovedCustomerReference[],
): number {
  let best = 0;
  for (const ref of references) {
    let score = 0;
    if (fieldsEqual(candidate.matchedIndustry, ref.matchedIndustry)) score += 25;
    if (fieldsEqual(candidate.buyerType, ref.buyerType)) score += 25;
    if (fieldsEqual(candidate.matchedProductServiceName, ref.matchedProductServiceName)) score += 25;
    if (fieldsEqual(candidate.country, ref.country)) score += 25;
    best = Math.max(best, score);
  }
  return best;
}

export function scoreToCustomerPriority(totalScore: number): TargetCustomerPriority {
  if (totalScore >= CUSTOMER_PRIORITY_THRESHOLDS.A_PLUS) return "A_PLUS";
  if (totalScore >= CUSTOMER_PRIORITY_THRESHOLDS.A) return "A";
  if (totalScore >= CUSTOMER_PRIORITY_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * Computes a customer candidate's 0-100 score across every factor and
 * converts it to a priority grade. Pure function — no DB access — the
 * processor is responsible for assembling CustomerScoringContext.
 */
export function computeCustomerScore(
  candidate: ScorableCustomerCandidate,
  context: CustomerScoringContext,
): CustomerScoreBreakdown {
  const productMatch = fieldMatchScore(candidate.matchedProductServiceName, context.products);
  const industryMatch = fieldMatchScore(candidate.matchedIndustry, context.targetIndustries);
  const buyerTypeMatch = fieldMatchScore(candidate.buyerType, context.buyerTypes);
  const countryMatch = fieldMatchScore(candidate.country, context.countriesServed);
  const websiteAvailability = presenceScore(candidate.website);
  const addressPhoneAvailability = addressPhoneAvailabilityScore(candidate.address, candidate.phoneNumber);
  const sourceQuality = sourceQualityScore(candidate.hasSnippet, candidate.isMockProvider);
  const confidenceScore = Math.min(100, Math.max(0, candidate.confidenceScore * 100));
  const similarityToApprovedBuyerTypes = similarityToApprovedScore(candidate, context.approvedReferences);
  // Placeholder — no feedback-driven adjustment exists yet (weight 0 in CUSTOMER_SCORING_WEIGHTS), see constants.ts.
  const brainFeedback = 50;

  const totalScore =
    productMatch * CUSTOMER_SCORING_WEIGHTS.productMatch +
    industryMatch * CUSTOMER_SCORING_WEIGHTS.industryMatch +
    buyerTypeMatch * CUSTOMER_SCORING_WEIGHTS.buyerTypeMatch +
    countryMatch * CUSTOMER_SCORING_WEIGHTS.countryMatch +
    websiteAvailability * CUSTOMER_SCORING_WEIGHTS.websiteAvailability +
    addressPhoneAvailability * CUSTOMER_SCORING_WEIGHTS.addressPhoneAvailability +
    sourceQuality * CUSTOMER_SCORING_WEIGHTS.sourceQuality +
    confidenceScore * CUSTOMER_SCORING_WEIGHTS.confidenceScore +
    similarityToApprovedBuyerTypes * CUSTOMER_SCORING_WEIGHTS.similarityToApprovedBuyerTypes +
    brainFeedback * CUSTOMER_SCORING_WEIGHTS.brainFeedback;

  const roundedTotal = Math.round(totalScore * 100) / 100;
  const priority = scoreToCustomerPriority(roundedTotal);

  return {
    productMatch,
    industryMatch,
    buyerTypeMatch,
    countryMatch,
    websiteAvailability,
    addressPhoneAvailability,
    sourceQuality,
    confidenceScore,
    similarityToApprovedBuyerTypes,
    brainFeedback,
    totalScore: roundedTotal,
    priority,
    explanation: `Scored ${roundedTotal}/100 (priority ${priority}) — product match ${productMatch}, industry match ${industryMatch}, buyer type match ${buyerTypeMatch}, country match ${countryMatch}.`,
  };
}
