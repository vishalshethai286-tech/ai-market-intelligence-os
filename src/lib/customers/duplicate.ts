import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TargetCustomer as TargetCustomerModel } from "@/models";
import type { TargetCustomer } from "@/models";
import { normalizeCompanyName, normalizeDomain, normalizePhone } from "@/lib/dedup/normalize";

// Re-exported so existing importers of this module (processor.ts, this
// file's own tests) keep working unchanged — the canonical implementation
// now lives in src/lib/dedup/normalize.ts (Phase 8), shared with the fuzzy
// duplicate-scoring engine so both systems agree on what "the same name" means.
export { normalizeCompanyName, normalizeDomain, normalizePhone };

/**
 * Same website domain in the same workspace is a strong signal of "same
 * company" — keyed on domain alone. Falling back to name+country when no
 * domain is available is a weaker signal (kept as a separate key so the two
 * never collide with each other).
 */
export function buildCustomerDuplicateKey(
  workspaceId: string,
  customerName: string,
  country: string,
  websiteDomain: string,
): string {
  const domain = normalizeDomain(websiteDomain);
  if (domain) return `${workspaceId}:domain:${domain}`;
  return `${workspaceId}:name:${normalizeCompanyName(customerName)}:${country.trim().toLowerCase()}`;
}

/** Same domain, same workspace = the same company — the processor treats this as an update, never a new row. */
export async function detectExistingCustomerByDomain(
  workspaceId: string,
  websiteDomain: string,
): Promise<TargetCustomer | null> {
  const domain = normalizeDomain(websiteDomain);
  if (!domain) return null;

  await dbConnect();
  const existing = await TargetCustomerModel.findOne({ workspaceId, websiteDomain: domain });
  return existing ? (existing.toObject() as TargetCustomer) : null;
}

/** Weaker signal than domain — matching normalized name + country flags a possible duplicate for human review rather than an automatic update. */
export async function detectExistingCustomerByNameCountry(
  workspaceId: string,
  customerName: string,
  country: string,
): Promise<TargetCustomer | null> {
  const normalizedName = normalizeCompanyName(customerName);
  if (!normalizedName) return null;

  await dbConnect();
  const candidates = await TargetCustomerModel.find({ workspaceId, country: country || null });
  const match = candidates.find((c) => normalizeCompanyName(c.customerName) === normalizedName);
  return match ? (match.toObject() as TargetCustomer) : null;
}
