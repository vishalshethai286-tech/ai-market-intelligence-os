export const COMPETITOR_MODEL = "claude-opus-4-8";
export const COMPETITOR_MAX_TOKENS = 2048;
/** Non-aggressive cap — this is "competitors if known", not a market map. */
export const MAX_COMPETITORS = 5;

/**
 * Controlled vocabulary of buying signals relevant to service providers
 * (agencies, consultants, logistics, IT firms, recruiters, etc.) — a company
 * showing one of these is more likely to be in-market for a service right
 * now. Stored as BUYING_SIGNAL facts/entities on the Business Brain; nothing
 * currently detects these automatically (that needs an external news/hiring/
 * filings data source, not yet integrated) — this is the taxonomy AI
 * extraction and future detection work should tag against.
 */
export const BUYING_SIGNAL_TYPES = [
  "HIRING_ACTIVITY",
  "EXPANSION",
  "FUNDING",
  "DIGITAL_TRANSFORMATION",
  "NEW_BRANCH_OPENING",
  "COMPLIANCE_REQUIREMENT",
  "TENDER_ANNOUNCEMENT",
  "NEW_PROJECT_ANNOUNCEMENT",
  "VENDOR_ONBOARDING",
  "PROCUREMENT_ACTIVITY",
] as const;

export type BuyingSignalType = (typeof BUYING_SIGNAL_TYPES)[number];

export const BUYING_SIGNAL_LABELS: Record<BuyingSignalType, string> = {
  HIRING_ACTIVITY: "Hiring activity",
  EXPANSION: "Expansion",
  FUNDING: "Funding",
  DIGITAL_TRANSFORMATION: "Digital transformation",
  NEW_BRANCH_OPENING: "New branch opening",
  COMPLIANCE_REQUIREMENT: "Compliance requirement",
  TENDER_ANNOUNCEMENT: "Tender announcement",
  NEW_PROJECT_ANNOUNCEMENT: "New project announcement",
  VENDOR_ONBOARDING: "Vendor onboarding",
  PROCUREMENT_ACTIVITY: "Procurement activity",
};
