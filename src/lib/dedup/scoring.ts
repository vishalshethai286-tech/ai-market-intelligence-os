import { normalizeCompanyName, normalizeDomain, normalizePhone, normalizeAddress, normalizeUrl, calculateStringSimilarity } from "./normalize";
import { DUPLICATE_SCORE_THRESHOLDS } from "./constants";

export type DuplicateScoreResult = {
  score: number;
  matchingFields: string[];
  conflictingFields: string[];
  reason: string;
};

function normalizeSimple(value: string): string {
  return value.trim().toLowerCase();
}

function reasonFrom(matchingFields: string[]): string {
  return matchingFields.length > 0 ? `Matches on ${matchingFields.join(", ")}` : "No strong matching fields";
}

export type CustomerDuplicateCandidate = {
  customerName: string;
  country: string;
  websiteDomain: string;
  address: string;
  phoneNumber: string;
  sourceUrl: string;
};

/**
 * 0-100 fuzzy duplicate score for two TargetCustomer candidates, using
 * website domain, company-name similarity, country, address similarity,
 * phone number, and source URL. Three specific high-confidence signals —
 * matching domain, matching source URL, or matching name+country+phone
 * together — are guaranteed to clear the auto-merge threshold even if the
 * weighted sum alone wouldn't, per the Phase 8 spec's worked examples.
 */
export function calculateCustomerDuplicateScore(
  a: CustomerDuplicateCandidate,
  b: CustomerDuplicateCandidate,
): DuplicateScoreResult {
  const domainA = normalizeDomain(a.websiteDomain);
  const domainB = normalizeDomain(b.websiteDomain);
  const domainMatch = Boolean(domainA && domainB && domainA === domainB);

  const nameSimilarity = calculateStringSimilarity(normalizeCompanyName(a.customerName), normalizeCompanyName(b.customerName));

  const countryMatch = Boolean(a.country && b.country && normalizeSimple(a.country) === normalizeSimple(b.country));

  const addressSimilarity =
    a.address && b.address ? calculateStringSimilarity(normalizeAddress(a.address), normalizeAddress(b.address)) : 0;

  const phoneA = normalizePhone(a.phoneNumber);
  const phoneB = normalizePhone(b.phoneNumber);
  const phoneMatch = Boolean(phoneA && phoneB && phoneA === phoneB);

  const urlA = normalizeUrl(a.sourceUrl);
  const urlB = normalizeUrl(b.sourceUrl);
  const sourceUrlMatch = Boolean(urlA && urlB && urlA === urlB);

  let score =
    (domainMatch ? 40 : 0) +
    nameSimilarity * 30 +
    (countryMatch ? 10 : 0) +
    addressSimilarity * 10 +
    (phoneMatch ? 10 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (domainMatch) matchingFields.push("websiteDomain");
  else if (domainA && domainB) conflictingFields.push("websiteDomain");

  if (nameSimilarity >= 0.9) matchingFields.push("customerName");
  else if (a.customerName && b.customerName && nameSimilarity < 0.5) conflictingFields.push("customerName");

  if (countryMatch) matchingFields.push("country");
  else if (a.country && b.country) conflictingFields.push("country");

  if (a.address && b.address && addressSimilarity >= 0.85) matchingFields.push("address");
  else if (a.address && b.address && addressSimilarity < 0.5) conflictingFields.push("address");

  if (phoneMatch) matchingFields.push("phoneNumber");
  else if (phoneA && phoneB) conflictingFields.push("phoneNumber");

  if (sourceUrlMatch) matchingFields.push("sourceUrl");

  // An (almost) exact name match in the same country is a strong-enough
  // signal on its own to warrant human review, even with nothing else to go
  // on — but not strong enough to auto-merge without a further corroborating
  // field (domain, phone, or source URL; see the explicit bumps below).
  if (nameSimilarity >= 0.95 && countryMatch) score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);

  // Explicit high-confidence combinations always clear the auto-merge threshold,
  // regardless of what the weighted sum above happened to land on.
  if (domainMatch) score = Math.max(score, 96);
  if (sourceUrlMatch) score = Math.max(score, 96);
  if (nameSimilarity >= 0.97 && countryMatch && phoneMatch) score = Math.max(score, 96);

  score = Math.min(100, Math.round(score));

  return { score, matchingFields, conflictingFields, reason: reasonFrom(matchingFields) };
}

export type ProjectDuplicateCandidate = {
  clientName: string;
  projectName: string;
  location: string;
  country: string;
  contractorName: string;
  timeline: string;
  sourceUrl: string;
  projectInformationLink: string;
};

/**
 * 0-100 fuzzy duplicate score for two ProjectOpportunity candidates (Phase
 * 9), using project-information-link/source-URL match, project-name
 * similarity, client name, location similarity, country, contractor name,
 * and timeline — same shape and auto-merge/review thresholds as
 * calculateCustomerDuplicateScore above. A shared project-information link
 * or source URL is treated as conclusive (the same announcement can't be
 * about two different projects), matching a shared domain for customers.
 */
export function calculateProjectDuplicateScore(a: ProjectDuplicateCandidate, b: ProjectDuplicateCandidate): DuplicateScoreResult {
  const linkA = normalizeUrl(a.projectInformationLink);
  const linkB = normalizeUrl(b.projectInformationLink);
  const linkMatch = Boolean(linkA && linkB && linkA === linkB);

  const urlA = normalizeUrl(a.sourceUrl);
  const urlB = normalizeUrl(b.sourceUrl);
  const sourceUrlMatch = Boolean(urlA && urlB && urlA === urlB);

  const projectNameSimilarity = calculateStringSimilarity(normalizeAddress(a.projectName), normalizeAddress(b.projectName));
  const clientMatch = Boolean(a.clientName && b.clientName && normalizeCompanyName(a.clientName) === normalizeCompanyName(b.clientName));
  const locationSimilarity =
    a.location && b.location ? calculateStringSimilarity(normalizeAddress(a.location), normalizeAddress(b.location)) : 0;
  const countryMatch = Boolean(a.country && b.country && normalizeSimple(a.country) === normalizeSimple(b.country));
  const contractorMatch = Boolean(
    a.contractorName && b.contractorName && normalizeCompanyName(a.contractorName) === normalizeCompanyName(b.contractorName),
  );
  const timelineMatch = Boolean(a.timeline && b.timeline && normalizeSimple(a.timeline) === normalizeSimple(b.timeline));

  let score =
    (linkMatch ? 30 : 0) +
    projectNameSimilarity * 25 +
    (clientMatch ? 15 : 0) +
    locationSimilarity * 10 +
    (countryMatch ? 5 : 0) +
    (contractorMatch ? 10 : 0) +
    (timelineMatch ? 5 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (linkMatch) matchingFields.push("projectInformationLink");
  else if (linkA && linkB) conflictingFields.push("projectInformationLink");

  if (sourceUrlMatch) matchingFields.push("sourceUrl");

  if (projectNameSimilarity >= 0.9) matchingFields.push("projectName");
  else if (a.projectName && b.projectName && projectNameSimilarity < 0.5) conflictingFields.push("projectName");

  if (clientMatch) matchingFields.push("clientName");
  else if (a.clientName && b.clientName) conflictingFields.push("clientName");

  if (a.location && b.location && locationSimilarity >= 0.85) matchingFields.push("location");
  else if (a.location && b.location && locationSimilarity < 0.5) conflictingFields.push("location");

  if (countryMatch) matchingFields.push("country");
  else if (a.country && b.country) conflictingFields.push("country");

  if (contractorMatch) matchingFields.push("contractorName");
  else if (a.contractorName && b.contractorName) conflictingFields.push("contractorName");

  if (timelineMatch) matchingFields.push("timeline");

  // A shared project-information link or source URL is conclusive on its
  // own — the same announcement page can't describe two different projects.
  if (linkMatch) score = Math.max(score, 96);
  if (sourceUrlMatch) score = Math.max(score, 96);
  // Per the Phase 9 spec's own language, these next two are each a "likely"/
  // "possible" duplicate signal on their own — strong enough for human
  // review, but not auto-merge without a link/URL to corroborate.
  if (clientMatch && projectNameSimilarity >= 0.9 && a.location && b.location && locationSimilarity >= 0.85) {
    score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);
  }
  if (projectNameSimilarity >= 0.9 && countryMatch && contractorMatch) {
    score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);
  }

  score = Math.min(100, Math.round(score));

  return { score, matchingFields, conflictingFields, reason: reasonFrom(matchingFields) };
}

export type TenderBuyerDuplicateCandidate = {
  customerName: string;
  country: string;
  websiteDomain: string;
  tenderWebsiteLink: string;
  phoneNumber: string;
  sourceUrl: string;
};

/**
 * 0-100 fuzzy duplicate score for two TenderBuyer candidates (Phase 10),
 * using website domain, tender-website-link, buyer-name similarity, country,
 * phone number, and source URL — same shape/thresholds as
 * calculateCustomerDuplicateScore, with tenderWebsiteLink standing in for
 * customer address as the second high-confidence link-style signal.
 */
export function calculateTenderBuyerDuplicateScore(a: TenderBuyerDuplicateCandidate, b: TenderBuyerDuplicateCandidate): DuplicateScoreResult {
  const domainA = normalizeDomain(a.websiteDomain);
  const domainB = normalizeDomain(b.websiteDomain);
  const domainMatch = Boolean(domainA && domainB && domainA === domainB);

  const linkA = normalizeUrl(a.tenderWebsiteLink);
  const linkB = normalizeUrl(b.tenderWebsiteLink);
  const linkMatch = Boolean(linkA && linkB && linkA === linkB);

  const nameSimilarity = calculateStringSimilarity(normalizeCompanyName(a.customerName), normalizeCompanyName(b.customerName));
  const countryMatch = Boolean(a.country && b.country && normalizeSimple(a.country) === normalizeSimple(b.country));
  const phoneMatch = Boolean(normalizePhone(a.phoneNumber) && normalizePhone(a.phoneNumber) === normalizePhone(b.phoneNumber));
  const sourceUrlMatch = Boolean(normalizeUrl(a.sourceUrl) && normalizeUrl(a.sourceUrl) === normalizeUrl(b.sourceUrl));

  let score = (domainMatch ? 30 : 0) + (linkMatch ? 20 : 0) + nameSimilarity * 30 + (countryMatch ? 10 : 0) + (phoneMatch ? 10 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (domainMatch) matchingFields.push("websiteDomain");
  else if (domainA && domainB) conflictingFields.push("websiteDomain");

  if (linkMatch) matchingFields.push("tenderWebsiteLink");
  else if (linkA && linkB) conflictingFields.push("tenderWebsiteLink");

  if (nameSimilarity >= 0.9) matchingFields.push("customerName");
  else if (a.customerName && b.customerName && nameSimilarity < 0.5) conflictingFields.push("customerName");

  if (countryMatch) matchingFields.push("country");
  else if (a.country && b.country) conflictingFields.push("country");

  if (phoneMatch) matchingFields.push("phoneNumber");

  if (sourceUrlMatch) matchingFields.push("sourceUrl");

  if (nameSimilarity >= 0.95 && countryMatch) score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);

  // A shared website domain, tender-website link, or source URL is
  // conclusive on its own — the same portal/page can't belong to two
  // different buyers.
  if (domainMatch) score = Math.max(score, 96);
  if (linkMatch) score = Math.max(score, 96);
  if (sourceUrlMatch) score = Math.max(score, 96);

  score = Math.min(100, Math.round(score));

  return { score, matchingFields, conflictingFields, reason: reasonFrom(matchingFields) };
}

export type TenderOpportunityDuplicateCandidate = {
  buyerOrganization: string;
  tenderTitle: string;
  tenderLink: string;
  startDate: string;
  endDate: string;
  country: string;
  sourceUrl: string;
};

/**
 * 0-100 fuzzy duplicate score for two TenderOpportunity candidates (Phase
 * 10), using tenderLink/source-URL match, buyer-organization match,
 * tender-title similarity, start/end dates, and country — same shape/
 * thresholds as calculateProjectDuplicateScore. A shared tenderLink or
 * source URL is conclusive on its own; "same buyer+title+country" or "same
 * title+dates+country" are each strong enough for human review, per the
 * spec's own "likely/possible duplicate" wording, but not auto-merge without
 * a link/URL to corroborate.
 */
export function calculateTenderOpportunityDuplicateScore(
  a: TenderOpportunityDuplicateCandidate,
  b: TenderOpportunityDuplicateCandidate,
): DuplicateScoreResult {
  const linkA = normalizeUrl(a.tenderLink);
  const linkB = normalizeUrl(b.tenderLink);
  const linkMatch = Boolean(linkA && linkB && linkA === linkB);

  const sourceUrlMatch = Boolean(normalizeUrl(a.sourceUrl) && normalizeUrl(a.sourceUrl) === normalizeUrl(b.sourceUrl));

  const buyerMatch = Boolean(a.buyerOrganization && b.buyerOrganization && normalizeCompanyName(a.buyerOrganization) === normalizeCompanyName(b.buyerOrganization));
  const titleSimilarity = calculateStringSimilarity(normalizeAddress(a.tenderTitle), normalizeAddress(b.tenderTitle));
  const datesMatch = Boolean(a.startDate && b.startDate && a.startDate === b.startDate && a.endDate === b.endDate);
  const endDateMatch = Boolean(a.endDate && b.endDate && a.endDate === b.endDate);
  const countryMatch = Boolean(a.country && b.country && normalizeSimple(a.country) === normalizeSimple(b.country));

  let score = (linkMatch ? 30 : 0) + (buyerMatch ? 20 : 0) + titleSimilarity * 30 + (datesMatch ? 10 : 0) + (countryMatch ? 10 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (linkMatch) matchingFields.push("tenderLink");
  else if (linkA && linkB) conflictingFields.push("tenderLink");

  if (sourceUrlMatch) matchingFields.push("sourceUrl");

  if (buyerMatch) matchingFields.push("buyerOrganization");
  else if (a.buyerOrganization && b.buyerOrganization) conflictingFields.push("buyerOrganization");

  if (titleSimilarity >= 0.9) matchingFields.push("tenderTitle");
  else if (a.tenderTitle && b.tenderTitle && titleSimilarity < 0.5) conflictingFields.push("tenderTitle");

  if (datesMatch) matchingFields.push("startDate/endDate");
  if (countryMatch) matchingFields.push("country");
  else if (a.country && b.country) conflictingFields.push("country");

  // A shared tender link or source URL is conclusive on its own.
  if (linkMatch) score = Math.max(score, 96);
  if (sourceUrlMatch) score = Math.max(score, 96);
  // Strong-but-not-conclusive combinations land in Pending Review, not auto-merge.
  if (buyerMatch && titleSimilarity >= 0.9 && countryMatch) score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);
  if (titleSimilarity >= 0.9 && endDateMatch && countryMatch) score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);

  score = Math.min(100, Math.round(score));

  return { score, matchingFields, conflictingFields, reason: reasonFrom(matchingFields) };
}

export type VendorRegistrationDuplicateCandidate = {
  customerName: string;
  country: string;
  websiteDomain: string;
  vendorRegistrationLink: string;
  phoneNumber: string;
  sourceUrl: string;
};

/**
 * 0-100 fuzzy duplicate score for two VendorRegistration candidates (Phase
 * 11), using website domain, vendor-registration-link, customer-name
 * similarity, country, phone number, and source URL — same shape/thresholds
 * as calculateTenderBuyerDuplicateScore, with vendorRegistrationLink standing
 * in for tenderWebsiteLink as the second high-confidence link-style signal.
 */
export function calculateVendorRegistrationDuplicateScore(
  a: VendorRegistrationDuplicateCandidate,
  b: VendorRegistrationDuplicateCandidate,
): DuplicateScoreResult {
  const domainA = normalizeDomain(a.websiteDomain);
  const domainB = normalizeDomain(b.websiteDomain);
  const domainMatch = Boolean(domainA && domainB && domainA === domainB);

  const linkA = normalizeUrl(a.vendorRegistrationLink);
  const linkB = normalizeUrl(b.vendorRegistrationLink);
  const linkMatch = Boolean(linkA && linkB && linkA === linkB);

  const nameSimilarity = calculateStringSimilarity(normalizeCompanyName(a.customerName), normalizeCompanyName(b.customerName));
  const countryMatch = Boolean(a.country && b.country && normalizeSimple(a.country) === normalizeSimple(b.country));
  const phoneMatch = Boolean(normalizePhone(a.phoneNumber) && normalizePhone(a.phoneNumber) === normalizePhone(b.phoneNumber));
  const sourceUrlMatch = Boolean(normalizeUrl(a.sourceUrl) && normalizeUrl(a.sourceUrl) === normalizeUrl(b.sourceUrl));

  let score = (domainMatch ? 30 : 0) + (linkMatch ? 20 : 0) + nameSimilarity * 30 + (countryMatch ? 10 : 0) + (phoneMatch ? 10 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (domainMatch) matchingFields.push("websiteDomain");
  else if (domainA && domainB) conflictingFields.push("websiteDomain");

  if (linkMatch) matchingFields.push("vendorRegistrationLink");
  else if (linkA && linkB) conflictingFields.push("vendorRegistrationLink");

  if (nameSimilarity >= 0.9) matchingFields.push("customerName");
  else if (a.customerName && b.customerName && nameSimilarity < 0.5) conflictingFields.push("customerName");

  if (countryMatch) matchingFields.push("country");
  else if (a.country && b.country) conflictingFields.push("country");

  if (phoneMatch) matchingFields.push("phoneNumber");

  if (sourceUrlMatch) matchingFields.push("sourceUrl");

  if (nameSimilarity >= 0.95 && countryMatch) score = Math.max(score, DUPLICATE_SCORE_THRESHOLDS.review + 5);

  // A shared website domain, vendor-registration link, or source URL is
  // conclusive on its own — the same portal/page can't belong to two
  // different vendor registration opportunities.
  if (domainMatch) score = Math.max(score, 96);
  if (linkMatch) score = Math.max(score, 96);
  if (sourceUrlMatch) score = Math.max(score, 96);

  score = Math.min(100, Math.round(score));

  return { score, matchingFields, conflictingFields, reason: reasonFrom(matchingFields) };
}
