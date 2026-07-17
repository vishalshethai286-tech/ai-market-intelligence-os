import { CONTACT_SCORING_WEIGHTS, CONTACT_PRIORITY_THRESHOLDS } from "./constants";
import type { ContactRoleCategory, ContactSeniority, ContactSourceType, ContactPriority } from "@/models";

/** Role categories most worth reaching out to for procurement/B2B sales purposes — see roleRelevance below. */
const HIGH_VALUE_ROLES: readonly ContactRoleCategory[] = [
  "PROCUREMENT",
  "PURCHASE",
  "SOURCING",
  "SUPPLY_CHAIN",
  "VENDOR_MANAGEMENT",
  "CONTRACTS",
  "TENDERING",
  "PROJECT_MANAGEMENT",
];
const MEDIUM_VALUE_ROLES: readonly ContactRoleCategory[] = [
  "ENGINEERING",
  "MAINTENANCE",
  "PLANT_OPERATIONS",
  "OPERATIONS",
  "TECHNICAL",
  "QUALITY",
  "MANAGEMENT",
];

/** Exported for reuse by src/lib/contacts/recommendations.ts's contact ranking — same seniority-value scale used in the overall priority score. */
export const SENIORITY_SCORES: Record<ContactSeniority, number> = {
  OWNER: 100,
  PRESIDENT: 100,
  CEO: 100,
  DIRECTOR: 90,
  VP: 90,
  HEAD: 80,
  MANAGER: 65,
  EXECUTIVE: 50,
  OFFICER: 50,
  ENGINEER: 40,
  COORDINATOR: 40,
  UNKNOWN: 20,
};

/** Sources scraped/copied straight from an authoritative company/procurement page are more trustworthy than a public directory or a bare manual entry with nothing to verify against. Exported for reuse by src/lib/contacts/recommendations.ts. */
export const SOURCE_QUALITY_SCORES: Record<ContactSourceType, number> = {
  COMPANY_WEBSITE: 90,
  CONTACT_PAGE: 90,
  TEAM_PAGE: 90,
  PROCUREMENT_PAGE: 90,
  SUPPLIER_PORTAL: 90,
  TENDER_DOCUMENT: 90,
  PUBLIC_PDF: 90,
  PRESS_RELEASE: 60,
  CONFERENCE_PAGE: 60,
  PUBLIC_DIRECTORY: 60,
  MANUAL_ENTRY: 50,
  CSV_IMPORT: 50,
  OTHER: 30,
};

function roleRelevanceScore(roleCategory: ContactRoleCategory): number {
  if (HIGH_VALUE_ROLES.includes(roleCategory)) return 100;
  if (MEDIUM_VALUE_ROLES.includes(roleCategory)) return 60;
  return 20;
}

export type ContactScoringContext = {
  /** The workspace's target/served countries, from the Business Brain — an empty array means "no country preference known yet". */
  targetCountries: string[];
};

export type ScorableContactCandidate = {
  roleCategory: ContactRoleCategory;
  seniority: ContactSeniority;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  /** Whether any of this contact's related records (TargetCustomer/ProjectOpportunity/TenderBuyer/TenderOpportunity/VendorRegistration) is in an approved-ish status — computed by the caller, since scoring stays a pure function with no DB access. */
  isLinkedToApprovedRecord: boolean;
  sourceType: ContactSourceType;
  country: string;
  /** 0-1, mirrors the model's own confidenceScore field. */
  confidenceScore: number;
};

export type ContactScoreBreakdown = {
  roleRelevance: number;
  seniority: number;
  hasEmail: number;
  hasPhone: number;
  hasLinkedIn: number;
  linkedToApprovedRecord: number;
  sourceQuality: number;
  countryRelevance: number;
  confidenceScore: number;
  totalScore: number;
  priority: ContactPriority;
  explanation: string;
};

/** Displays a Contact's 0-1 confidenceScore as a whole-number percentage string (e.g. "78%") — internal storage stays 0-1 (matching every other extractor/confidence field in this codebase), this is purely a presentation helper for UI/CSV. */
export function formatConfidenceScore(confidenceScore: number): string {
  return `${Math.round(Math.min(1, Math.max(0, confidenceScore)) * 100)}%`;
}

export function scoreToContactPriority(score: number): ContactPriority {
  if (score >= CONTACT_PRIORITY_THRESHOLDS.A_PLUS) return "A_PLUS";
  if (score >= CONTACT_PRIORITY_THRESHOLDS.A) return "A";
  if (score >= CONTACT_PRIORITY_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * 0-100 composite priority score for a Contact, weighted across role
 * relevance, seniority, contactability (email/phone/LinkedIn), whether
 * they're linked to an already-approved discovery record, source quality,
 * country relevance, and extraction confidence. Mirrors the shape of
 * computeTenderScore/computeCustomerScore — a pure function, no DB access.
 */
export function computeContactScore(candidate: ScorableContactCandidate, context: ContactScoringContext): ContactScoreBreakdown {
  const roleRelevance = roleRelevanceScore(candidate.roleCategory);
  const seniority = SENIORITY_SCORES[candidate.seniority] ?? 20;
  const hasEmail = candidate.hasEmail ? 100 : 0;
  const hasPhone = candidate.hasPhone ? 100 : 0;
  const hasLinkedIn = candidate.hasLinkedIn ? 100 : 0;
  const linkedToApprovedRecord = candidate.isLinkedToApprovedRecord ? 100 : 0;
  const sourceQuality = SOURCE_QUALITY_SCORES[candidate.sourceType] ?? 30;

  const knownCountries = context.targetCountries.map((c) => c.toLowerCase());
  const countryRelevance = !candidate.country
    ? 50
    : knownCountries.length === 0
      ? 50
      : knownCountries.includes(candidate.country.toLowerCase())
        ? 100
        : 0;

  const confidenceScore = Math.min(1, Math.max(0, candidate.confidenceScore)) * 100;

  const totalScore = Math.round(
    roleRelevance * CONTACT_SCORING_WEIGHTS.roleRelevance +
      seniority * CONTACT_SCORING_WEIGHTS.seniority +
      hasEmail * CONTACT_SCORING_WEIGHTS.hasEmail +
      hasPhone * CONTACT_SCORING_WEIGHTS.hasPhone +
      hasLinkedIn * CONTACT_SCORING_WEIGHTS.hasLinkedIn +
      linkedToApprovedRecord * CONTACT_SCORING_WEIGHTS.linkedToApprovedRecord +
      sourceQuality * CONTACT_SCORING_WEIGHTS.sourceQuality +
      countryRelevance * CONTACT_SCORING_WEIGHTS.countryRelevance +
      confidenceScore * CONTACT_SCORING_WEIGHTS.confidenceScore,
  );

  const priority = scoreToContactPriority(totalScore);

  const explanationParts = [
    `Role ${candidate.roleCategory} (${roleRelevance}/100)`,
    `seniority ${candidate.seniority} (${seniority}/100)`,
    candidate.hasEmail ? "has email" : "no email",
    candidate.hasPhone ? "has phone" : "no phone",
    candidate.hasLinkedIn ? "has LinkedIn" : "no LinkedIn",
    candidate.isLinkedToApprovedRecord ? "linked to an approved record" : "not linked to an approved record",
  ];

  return {
    roleRelevance,
    seniority,
    hasEmail,
    hasPhone,
    hasLinkedIn,
    linkedToApprovedRecord,
    sourceQuality,
    countryRelevance,
    confidenceScore,
    totalScore,
    priority,
    explanation: explanationParts.join(", "),
  };
}
