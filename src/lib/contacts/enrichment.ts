import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { Contact as ContactModel } from "@/models";
import type {
  ContactRoleCategory,
  ContactSeniority,
  ContactStatus,
  ContactEnrichmentStatus,
  ContactRecommendedAction,
  ContactBestContactFor,
} from "@/models";

export class ContactNotFoundError extends Error {}

/** Minimal shape enrichment needs — a pure-function subset of Contact, so analyzeContactCompleteness/calculateEnrichmentScore/etc. stay testable without touching the database. */
export type EnrichableContact = {
  designation: string | null;
  roleCategory: ContactRoleCategory;
  seniority: ContactSeniority;
  email: string | null;
  phoneNumber: string | null;
  mobileNumber: string | null;
  linkedinUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  sourceUrl: string | null;
  confidenceScore: number;
  lastVerifiedAt: Date | null;
  nextFollowUpAt: Date | null;
  status: ContactStatus;
  doNotContact: boolean;
  relatedTargetCustomerId: string | null;
  relatedProjectOpportunityId: string | null;
  relatedTenderBuyerId: string | null;
  relatedTenderOpportunityId: string | null;
  relatedVendorRegistrationId: string | null;
};

/** Below this confidence, a contact is treated as unverified/low-confidence regardless of how it was sourced. */
const LOW_CONFIDENCE_THRESHOLD = 0.5;
/** A verification older than this is treated the same as "never verified" for enrichment purposes. */
const VERIFICATION_STALE_DAYS = 180;

function hasAnyRelatedRecord(contact: EnrichableContact): boolean {
  return Boolean(
    contact.relatedTargetCustomerId ||
      contact.relatedProjectOpportunityId ||
      contact.relatedTenderBuyerId ||
      contact.relatedTenderOpportunityId ||
      contact.relatedVendorRegistrationId,
  );
}

function isVerificationStale(lastVerifiedAt: Date | null): boolean {
  if (!lastVerifiedAt) return true;
  const ageDays = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > VERIFICATION_STALE_DAYS;
}

function isInactiveContact(contact: EnrichableContact): boolean {
  return contact.doNotContact || contact.status === "ARCHIVED" || contact.status === "REJECTED" || contact.status === "NOT_RELEVANT";
}

export type ContactCompletenessBreakdown = {
  hasDesignation: boolean;
  hasRoleCategory: boolean;
  hasSeniority: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  hasCompanyLink: boolean;
  hasSourceUrl: boolean;
  hasRelatedRecordLink: boolean;
  hasHighConfidence: boolean;
  hasRecentVerification: boolean;
  isActive: boolean;
};

/** Raw yes/no breakdown of every completeness signal enrichment scoring/status/missing-fields are all derived from — a pure function, no DB access. */
export function analyzeContactCompleteness(contact: EnrichableContact): ContactCompletenessBreakdown {
  return {
    hasDesignation: Boolean(contact.designation),
    hasRoleCategory: contact.roleCategory !== "OTHER",
    hasSeniority: contact.seniority !== "UNKNOWN",
    hasEmail: Boolean(contact.email),
    hasPhone: Boolean(contact.phoneNumber || contact.mobileNumber),
    hasLinkedIn: Boolean(contact.linkedinUrl),
    hasCompanyLink: Boolean(contact.companyDomain || contact.companyName),
    hasSourceUrl: Boolean(contact.sourceUrl),
    hasRelatedRecordLink: hasAnyRelatedRecord(contact),
    hasHighConfidence: contact.confidenceScore >= LOW_CONFIDENCE_THRESHOLD,
    hasRecentVerification: !isVerificationStale(contact.lastVerifiedAt),
    isActive: !isInactiveContact(contact),
  };
}

/** Each completeness factor's contribution to the 0-100 enrichment score. Weights sum to 100. */
const ENRICHMENT_WEIGHTS = {
  hasDesignation: 8,
  hasRoleCategory: 6,
  hasSeniority: 4,
  hasEmail: 16,
  hasPhone: 12,
  hasLinkedIn: 8,
  hasCompanyLink: 8,
  hasSourceUrl: 4,
  hasRelatedRecordLink: 8,
  hasHighConfidence: 8,
  hasRecentVerification: 6,
  isActive: 12,
} as const;

/** 0-100 "how complete/enriched is this record" score — distinct from priorityScore (which measures lead value, not data completeness). Pure function, no DB access. */
export function calculateEnrichmentScore(contact: EnrichableContact): number {
  const breakdown = analyzeContactCompleteness(contact);
  const score = (Object.keys(ENRICHMENT_WEIGHTS) as (keyof typeof ENRICHMENT_WEIGHTS)[]).reduce(
    (total, key) => total + (breakdown[key] ? ENRICHMENT_WEIGHTS[key] : 0),
    0,
  );
  return Math.round(score);
}

/** Human-readable list of every gap in this contact's data — used both for the enrichmentStatus decision and for display (Contact detail's "Missing fields" section, CSV export). */
export function getMissingFields(contact: EnrichableContact): string[] {
  const breakdown = analyzeContactCompleteness(contact);
  const missing: string[] = [];
  if (!breakdown.hasDesignation) missing.push("Designation");
  if (!breakdown.hasRoleCategory) missing.push("Role Category");
  if (!breakdown.hasSeniority) missing.push("Seniority");
  if (!breakdown.hasEmail) missing.push("Email");
  if (!breakdown.hasPhone) missing.push("Phone");
  if (!breakdown.hasLinkedIn) missing.push("LinkedIn URL");
  if (!breakdown.hasCompanyLink) missing.push("Company Link");
  if (!breakdown.hasSourceUrl) missing.push("Source URL");
  if (!breakdown.hasRelatedRecordLink) missing.push("Related Opportunity Link");
  if (!breakdown.hasRecentVerification) missing.push("Verification");
  if (!breakdown.hasHighConfidence) missing.push("Confidence");
  return missing;
}

/** Single-value status summarizing the most pressing enrichment gap — checked in priority order, first match wins (unlike getMissingFields, which lists every gap at once). */
export function determineEnrichmentStatus(contact: EnrichableContact): ContactEnrichmentStatus {
  if (contact.doNotContact) return "DO_NOT_CONTACT";
  if (contact.status === "ARCHIVED") return "ARCHIVED";

  const breakdown = analyzeContactCompleteness(contact);
  if (!breakdown.hasEmail) return "NEEDS_EMAIL";
  if (!breakdown.hasPhone) return "NEEDS_PHONE";
  if (!breakdown.hasRoleCategory || !breakdown.hasDesignation) return "NEEDS_ROLE";
  if (!breakdown.hasRecentVerification) return "NEEDS_VERIFICATION";
  if (!breakdown.hasLinkedIn) return "NEEDS_LINKEDIN";
  if (!breakdown.hasRelatedRecordLink) return "NEEDS_COMPANY_LINK";
  if (!breakdown.hasHighConfidence) return "LOW_CONFIDENCE";
  return "COMPLETE";
}

/**
 * What should happen next with this contact — a single recommended next
 * action, checked in priority order (stop-everything checks first, then
 * time-sensitive follow-ups, then filling contact-info gaps, then
 * verification/enrichment, then the actual outreach action, then a generic
 * review fallback). Pure function, no DB access.
 */
export function determineRecommendedAction(contact: EnrichableContact): { action: ContactRecommendedAction; reason: string } {
  if (contact.doNotContact) {
    return { action: "DO_NOT_CONTACT", reason: "This contact is marked do-not-contact." };
  }
  if (contact.status === "ARCHIVED" || contact.status === "NOT_RELEVANT") {
    return { action: "NONE", reason: `Contact status is ${contact.status === "ARCHIVED" ? "archived" : "not relevant"}.` };
  }
  if (contact.nextFollowUpAt && new Date(contact.nextFollowUpAt) <= new Date()) {
    return { action: "FOLLOW_UP", reason: "A follow-up is due or overdue." };
  }

  const breakdown = analyzeContactCompleteness(contact);
  if (!breakdown.hasEmail && !breakdown.hasPhone) {
    return { action: "FIND_EMAIL", reason: "No email or phone number on file." };
  }
  if (!breakdown.hasEmail) {
    return { action: "FIND_EMAIL", reason: "No email on file." };
  }
  if (!breakdown.hasPhone) {
    return { action: "FIND_PHONE", reason: "No phone number on file." };
  }
  if (!breakdown.hasRecentVerification || !breakdown.hasHighConfidence) {
    return { action: "VERIFY_CONTACT", reason: "Contact information hasn't been verified recently or has low confidence." };
  }
  if (!breakdown.hasRelatedRecordLink) {
    return { action: "LINK_TO_OPPORTUNITY", reason: "Not yet linked to a customer, project, tender, or vendor registration." };
  }
  if (!breakdown.hasLinkedIn) {
    return { action: "ADD_LINKEDIN", reason: "No LinkedIn profile on file." };
  }
  if (contact.status === "NEW" || contact.status === "REVIEWED" || contact.status === "APPROVED") {
    return { action: "EMAIL_DRAFT", reason: "Ready for first outreach." };
  }
  if (contact.status === "FOLLOW_UP") {
    return { action: "FOLLOW_UP", reason: "Contact is marked for follow-up." };
  }
  return { action: "REVIEW", reason: "Contact is complete — periodic review recommended." };
}

const PROCUREMENT_ROLE_CATEGORIES: readonly ContactRoleCategory[] = [
  "PROCUREMENT",
  "PURCHASE",
  "SOURCING",
  "SUPPLY_CHAIN",
  "VENDOR_MANAGEMENT",
  "CONTRACTS",
  "TENDERING",
];
const TECHNICAL_ROLE_CATEGORIES: readonly ContactRoleCategory[] = ["ENGINEERING", "MAINTENANCE", "PLANT_OPERATIONS", "OPERATIONS", "TECHNICAL", "QUALITY"];

/**
 * What this contact is best used for — prefers whichever specific
 * opportunity/customer record it's linked to (since that's the most
 * concrete answer), and falls back to a role-based general-purpose label
 * when the contact isn't linked to anything yet. Pure function, no DB access.
 */
export function determineBestContactFor(contact: EnrichableContact): ContactBestContactFor {
  if (contact.relatedProjectOpportunityId) return "PROJECT_OPPORTUNITY";
  if (contact.relatedTenderOpportunityId || contact.relatedTenderBuyerId) return "TENDER_OPPORTUNITY";
  if (contact.relatedVendorRegistrationId) return "VENDOR_REGISTRATION";
  if (contact.relatedTargetCustomerId) return "CUSTOMER_OUTREACH";

  if (PROCUREMENT_ROLE_CATEGORIES.includes(contact.roleCategory)) return "PROCUREMENT_CONTACT";
  if (TECHNICAL_ROLE_CATEGORIES.includes(contact.roleCategory)) return "TECHNICAL_CONTACT";
  if (contact.roleCategory === "MANAGEMENT") return "MANAGEMENT_CONTACT";
  return "GENERAL_CONTACT";
}

export type ContactEnrichmentFields = {
  enrichmentScore: number;
  enrichmentStatus: ContactEnrichmentStatus;
  missingFields: string[];
  recommendedAction: ContactRecommendedAction;
  recommendedActionReason: string;
  bestContactFor: ContactBestContactFor;
};

/** Computes every enrichment field at once — the single function contacts/service.ts's createContact/updateContact call inline (no extra DB round-trip), and that refreshContactEnrichment below also uses when refreshing a contact standalone. Never touches doNotContact/doNotContactReason/ownerUserId/assignedToUserId — those are user-set fields the caller must preserve itself. */
export function computeEnrichmentFields(contact: EnrichableContact): ContactEnrichmentFields {
  const { action, reason } = determineRecommendedAction(contact);
  return {
    enrichmentScore: calculateEnrichmentScore(contact),
    enrichmentStatus: determineEnrichmentStatus(contact),
    missingFields: getMissingFields(contact),
    recommendedAction: action,
    recommendedActionReason: reason,
    bestContactFor: determineBestContactFor(contact),
  };
}

/** Re-runs enrichment for one contact and saves the result — for a manual "Refresh Enrichment" action on the Contact detail page. Preserves doNotContact/doNotContactReason (this function never touches them) and does not recompute priorityScore (that's contacts/service.ts's rescoreContact's job). */
export async function refreshContactEnrichment(workspaceId: string, contactId: string) {
  await dbConnect();
  const doc = await ContactModel.findOne({ _id: contactId, workspaceId });
  if (!doc) throw new ContactNotFoundError("That contact doesn't exist in this workspace.");

  const fields = computeEnrichmentFields(doc.toObject());
  doc.enrichmentScore = fields.enrichmentScore;
  doc.enrichmentStatus = fields.enrichmentStatus;
  doc.missingFields = fields.missingFields;
  doc.recommendedAction = fields.recommendedAction;
  doc.recommendedActionReason = fields.recommendedActionReason;
  doc.bestContactFor = fields.bestContactFor;
  await doc.save();

  return doc.toObject();
}

/** Refreshes enrichment for every contact in a workspace — for a workspace-wide "Refresh All Enrichment" batch action or scheduled sweep. Returns how many were updated. */
export async function refreshWorkspaceContactEnrichment(workspaceId: string): Promise<{ refreshed: number }> {
  await dbConnect();
  const docs = await ContactModel.find({ workspaceId });
  let refreshed = 0;
  for (const doc of docs) {
    const fields = computeEnrichmentFields(doc.toObject());
    doc.enrichmentScore = fields.enrichmentScore;
    doc.enrichmentStatus = fields.enrichmentStatus;
    doc.missingFields = fields.missingFields;
    doc.recommendedAction = fields.recommendedAction;
    doc.recommendedActionReason = fields.recommendedActionReason;
    doc.bestContactFor = fields.bestContactFor;
    await doc.save();
    refreshed += 1;
  }
  return { refreshed };
}
