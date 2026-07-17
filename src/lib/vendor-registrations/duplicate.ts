import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { VendorRegistration as VendorRegistrationModel } from "@/models";
import type { VendorRegistration } from "@/models";
import { normalizeCompanyName, normalizeDomain, normalizeUrl } from "@/lib/dedup/normalize";

// Re-exported under vendor-registration-domain names for clarity at call
// sites — same canonical implementations as src/lib/tenders/duplicate.ts and
// src/lib/customers/duplicate.ts use, from src/lib/dedup/normalize.ts (Phase 8).
export const normalizeVendorRegistrationName = normalizeCompanyName;
export const normalizeVendorRegistrationLink = normalizeUrl;

/**
 * Same vendorRegistrationLink, or same website domain, in the same workspace
 * is a strong signal of "same vendor registration" — keyed on whichever is
 * available (link first, since it's the more specific identifier for this
 * record type). Falling back to customerName+country when neither is
 * available is a weaker signal (kept as a separate key so it never collides
 * with the strong ones).
 */
export function buildVendorRegistrationDuplicateKey(
  workspaceId: string,
  customerName: string,
  country: string,
  websiteDomain: string,
  vendorRegistrationLink: string,
): string {
  const link = normalizeVendorRegistrationLink(vendorRegistrationLink);
  if (link) return `${workspaceId}:link:${link}`;
  const domain = normalizeDomain(websiteDomain);
  if (domain) return `${workspaceId}:domain:${domain}`;
  return `${workspaceId}:name:${normalizeVendorRegistrationName(customerName)}:${country.trim().toLowerCase()}`;
}

export type ExistingVendorRegistrationMatch = { registration: VendorRegistration; matchType: "STRONG" | "WEAK" };

/**
 * Looks for an existing VendorRegistration that's plausibly the same
 * real-world opportunity: a matching vendorRegistrationLink, or a matching
 * website domain + country, is a STRONG match (the processor treats this as
 * an update, never a new row); a matching normalized customerName+country
 * with neither of those is a WEAK match (flagged POSSIBLE_DUPLICATE, but
 * still creates a new row for a human to resolve).
 */
export async function detectExistingVendorRegistration(
  workspaceId: string,
  customerName: string,
  country: string,
  websiteDomain: string,
  vendorRegistrationLink: string,
): Promise<ExistingVendorRegistrationMatch | null> {
  await dbConnect();

  const link = normalizeVendorRegistrationLink(vendorRegistrationLink);
  const domain = normalizeDomain(websiteDomain);

  if (link || domain) {
    const candidates = await VendorRegistrationModel.find({
      workspaceId,
      $or: [...(link ? [{ vendorRegistrationLink: { $ne: null } }] : []), ...(domain ? [{ websiteDomain: domain }] : [])],
    });
    const strongMatch = candidates.find(
      (c) =>
        (link && normalizeVendorRegistrationLink(c.vendorRegistrationLink ?? "") === link) ||
        (domain && c.websiteDomain === domain && (!country || c.country === country)),
    );
    if (strongMatch) return { registration: strongMatch.toObject() as VendorRegistration, matchType: "STRONG" };
  }

  const normalizedName = normalizeVendorRegistrationName(customerName);
  if (!normalizedName) return null;
  const nameCandidates = await VendorRegistrationModel.find({ workspaceId, country: country || null });
  const weakMatch = nameCandidates.find((c) => normalizeVendorRegistrationName(c.customerName) === normalizedName);
  return weakMatch ? { registration: weakMatch.toObject() as VendorRegistration, matchType: "WEAK" } : null;
}
