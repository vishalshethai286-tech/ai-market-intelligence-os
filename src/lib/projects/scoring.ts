import { PROJECT_SCORING_WEIGHTS, PROJECT_PRIORITY_THRESHOLDS, PROJECT_STAGE_SCORES, TENDER_LIKELIHOOD_BY_STAGE } from "./constants";
import type { ProjectOpportunityPriority } from "@/models";

/** The candidate/result fields the scorer actually reads — decoupled from ProjectCandidate/RawSearchResult so this stays a pure function. */
export type ScorableProjectCandidate = {
  industry: string;
  matchedProductServiceName: string;
  country: string;
  contractorName: string;
  timeline: string;
  clientName: string;
  projectStage: string;
  confidenceScore: number;
  hasSnippet: boolean;
  isMockProvider: boolean;
};

export type ProjectScoringContext = {
  /** Our current PRODUCT_OR_SERVICE / TARGET_INDUSTRY / COUNTRY_SERVED Business Brain facts. */
  products: string[];
  targetIndustries: string[];
  countriesServed: string[];
};

export type ProjectScoreBreakdown = {
  productMatch: number;
  industryMatch: number;
  countryMatch: number;
  projectStage: number;
  timelineClarity: number;
  contractorVisibility: number;
  clientClarity: number;
  sourceQuality: number;
  tenderLikelihood: number;
  confidenceScore: number;
  totalScore: number;
  priority: ProjectOpportunityPriority;
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

/** Proxy for how trustworthy the source is: has a snippet to corroborate the title (60), and came from a real (non-mock) search provider (40) — same heuristic as customer scoring. */
function sourceQualityScore(hasSnippet: boolean, isMockProvider: boolean): number {
  return (hasSnippet ? 60 : 0) + (isMockProvider ? 0 : 40);
}

export function scoreToProjectPriority(totalScore: number): ProjectOpportunityPriority {
  if (totalScore >= PROJECT_PRIORITY_THRESHOLDS.A_PLUS) return "A_PLUS";
  if (totalScore >= PROJECT_PRIORITY_THRESHOLDS.A) return "A";
  if (totalScore >= PROJECT_PRIORITY_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * Computes a project candidate's 0-100 score across every factor and
 * converts it to a priority grade. Pure function — no DB access — the
 * processor is responsible for assembling ProjectScoringContext.
 */
export function computeProjectScore(
  candidate: ScorableProjectCandidate,
  context: ProjectScoringContext,
): ProjectScoreBreakdown {
  const productMatch = fieldMatchScore(candidate.matchedProductServiceName, context.products);
  const industryMatch = fieldMatchScore(candidate.industry, context.targetIndustries);
  const countryMatch = fieldMatchScore(candidate.country, context.countriesServed);
  const projectStage = PROJECT_STAGE_SCORES[candidate.projectStage] ?? PROJECT_STAGE_SCORES.UNKNOWN;
  const timelineClarity = presenceScore(candidate.timeline);
  const contractorVisibility = presenceScore(candidate.contractorName);
  const clientClarity = presenceScore(candidate.clientName);
  const sourceQuality = sourceQualityScore(candidate.hasSnippet, candidate.isMockProvider);
  const tenderLikelihood = TENDER_LIKELIHOOD_BY_STAGE[candidate.projectStage] ?? TENDER_LIKELIHOOD_BY_STAGE.UNKNOWN;
  const confidenceScore = Math.min(100, Math.max(0, candidate.confidenceScore * 100));

  const totalScore =
    productMatch * PROJECT_SCORING_WEIGHTS.productMatch +
    industryMatch * PROJECT_SCORING_WEIGHTS.industryMatch +
    countryMatch * PROJECT_SCORING_WEIGHTS.countryMatch +
    projectStage * PROJECT_SCORING_WEIGHTS.projectStage +
    timelineClarity * PROJECT_SCORING_WEIGHTS.timelineClarity +
    contractorVisibility * PROJECT_SCORING_WEIGHTS.contractorVisibility +
    clientClarity * PROJECT_SCORING_WEIGHTS.clientClarity +
    sourceQuality * PROJECT_SCORING_WEIGHTS.sourceQuality +
    tenderLikelihood * PROJECT_SCORING_WEIGHTS.tenderLikelihood +
    confidenceScore * PROJECT_SCORING_WEIGHTS.confidenceScore;

  const roundedTotal = Math.round(totalScore * 100) / 100;
  const priority = scoreToProjectPriority(roundedTotal);

  return {
    productMatch,
    industryMatch,
    countryMatch,
    projectStage,
    timelineClarity,
    contractorVisibility,
    clientClarity,
    sourceQuality,
    tenderLikelihood,
    confidenceScore,
    totalScore: roundedTotal,
    priority,
    explanation: `Scored ${roundedTotal}/100 (priority ${priority}) — product match ${productMatch}, industry match ${industryMatch}, stage ${candidate.projectStage} (${projectStage}).`,
  };
}
