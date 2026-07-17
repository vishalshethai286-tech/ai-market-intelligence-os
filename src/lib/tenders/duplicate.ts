import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TenderBuyer as TenderBuyerModel, TenderOpportunity as TenderOpportunityModel } from "@/models";
import type { TenderBuyer, TenderOpportunity } from "@/models";
import { normalizeCompanyName, normalizeDomain, normalizeAddress, normalizeUrl } from "@/lib/dedup/normalize";

// Re-exported under tender-domain names for clarity at call sites — same
// canonical implementations as src/lib/customers/duplicate.ts and
// src/lib/projects/duplicate.ts use, from src/lib/dedup/normalize.ts (Phase 8).
export const normalizeBuyerOrganization = normalizeCompanyName;
export const normalizeTenderTitle = normalizeAddress;
export const normalizeTenderLink = normalizeUrl;

/**
 * Same website domain, or same tender-website link, in the same workspace is
 * a strong signal of "same buyer" — keyed on whichever is available (domain
 * first, since it's the more stable identifier). Falling back to
 * customerName+country when neither is available is a weaker signal (kept
 * as a separate key so it never collides with the strong ones).
 */
export function buildTenderBuyerDuplicateKey(
  workspaceId: string,
  customerName: string,
  country: string,
  websiteDomain: string,
  tenderWebsiteLink: string,
): string {
  const domain = normalizeDomain(websiteDomain);
  if (domain) return `${workspaceId}:domain:${domain}`;
  const link = normalizeTenderLink(tenderWebsiteLink);
  if (link) return `${workspaceId}:link:${link}`;
  return `${workspaceId}:name:${normalizeBuyerOrganization(customerName)}:${country.trim().toLowerCase()}`;
}

/** Same tenderLink in the same workspace is a strong signal of "same tender" — keyed on the link alone. Falling back to buyerOrganization+tenderTitle+country is weaker. */
export function buildTenderOpportunityDuplicateKey(
  workspaceId: string,
  tenderLink: string,
  buyerOrganization: string,
  tenderTitle: string,
  country: string,
): string {
  const link = normalizeTenderLink(tenderLink);
  if (link) return `${workspaceId}:link:${link}`;
  return `${workspaceId}:name:${normalizeBuyerOrganization(buyerOrganization)}:${normalizeTenderTitle(tenderTitle)}:${country.trim().toLowerCase()}`;
}

export type ExistingTenderBuyerMatch = { buyer: TenderBuyer; matchType: "STRONG" | "WEAK" };

/**
 * Looks for an existing TenderBuyer that's plausibly the same real-world
 * buyer: a matching website domain or tenderWebsiteLink is a STRONG match
 * (the processor treats this as an update, never a new row); a matching
 * normalized customerName+country with neither of those is a WEAK match
 * (flagged POSSIBLE_DUPLICATE, but still creates a new row for a human to
 * resolve).
 */
export async function detectExistingTenderBuyer(
  workspaceId: string,
  customerName: string,
  country: string,
  websiteDomain: string,
  tenderWebsiteLink: string,
): Promise<ExistingTenderBuyerMatch | null> {
  await dbConnect();

  const domain = normalizeDomain(websiteDomain);
  const link = normalizeTenderLink(tenderWebsiteLink);

  if (domain || link) {
    const candidates = await TenderBuyerModel.find({
      workspaceId,
      $or: [...(domain ? [{ websiteDomain: domain }] : []), ...(link ? [{ tenderWebsiteLink: { $ne: null } }] : [])],
    });
    const strongMatch = candidates.find(
      (c) => (domain && c.websiteDomain === domain) || (link && normalizeTenderLink(c.tenderWebsiteLink ?? "") === link),
    );
    if (strongMatch) return { buyer: strongMatch.toObject() as TenderBuyer, matchType: "STRONG" };
  }

  const normalizedName = normalizeBuyerOrganization(customerName);
  if (!normalizedName) return null;
  const nameCandidates = await TenderBuyerModel.find({ workspaceId, country: country || null });
  const weakMatch = nameCandidates.find((c) => normalizeBuyerOrganization(c.customerName) === normalizedName);
  return weakMatch ? { buyer: weakMatch.toObject() as TenderBuyer, matchType: "WEAK" } : null;
}

export type ExistingTenderOpportunityMatch = { opportunity: TenderOpportunity; matchType: "STRONG" | "WEAK" };

/**
 * Looks for an existing TenderOpportunity that's plausibly the same tender:
 * a matching tenderLink is a STRONG match (update, never a new row); a
 * matching normalized buyerOrganization+tenderTitle+country is a WEAK match
 * (flagged POSSIBLE_DUPLICATE, still creates a new row for review).
 */
export async function detectExistingTenderOpportunity(
  workspaceId: string,
  tenderLink: string,
  buyerOrganization: string,
  tenderTitle: string,
  country: string,
): Promise<ExistingTenderOpportunityMatch | null> {
  await dbConnect();

  const link = normalizeTenderLink(tenderLink);
  if (link) {
    const candidates = await TenderOpportunityModel.find({ workspaceId, tenderLink: { $ne: null } });
    const strongMatch = candidates.find((c) => normalizeTenderLink(c.tenderLink ?? "") === link);
    if (strongMatch) return { opportunity: strongMatch.toObject() as TenderOpportunity, matchType: "STRONG" };
  }

  const normalizedOrg = normalizeBuyerOrganization(buyerOrganization);
  const normalizedTitle = normalizeTenderTitle(tenderTitle);
  if (!normalizedOrg || !normalizedTitle) return null;
  const nameCandidates = await TenderOpportunityModel.find({ workspaceId, country: country || null });
  const weakMatch = nameCandidates.find(
    (c) => normalizeBuyerOrganization(c.buyerOrganization) === normalizedOrg && normalizeTenderTitle(c.tenderTitle) === normalizedTitle,
  );
  return weakMatch ? { opportunity: weakMatch.toObject() as TenderOpportunity, matchType: "WEAK" } : null;
}
