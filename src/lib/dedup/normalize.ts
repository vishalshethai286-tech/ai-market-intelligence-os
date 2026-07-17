/**
 * Generic, record-type-agnostic normalization/similarity primitives shared
 * by every duplicate-scoring function in src/lib/dedup/scoring.ts. Also
 * re-exported from src/lib/customers/duplicate.ts (Phase 7's basic
 * domain/name-key dedup) so both systems compare names/domains/phones the
 * same way instead of drifting apart.
 */

/** Common legal-entity suffixes stripped before comparing company names, so "Acme Inc." and "Acme" match. Repeats to also strip combined suffixes like "Pvt Ltd". */
const NAME_SUFFIXES = /(\s*\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|company|pvt|plc|gmbh|srl|sa|bv)\.?)+\s*$/gi;

/** Lowercased, punctuation-stripped, legal-suffix-stripped company name — the basis for a "same company" comparison. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(NAME_SUFFIXES, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bare lowercased hostname with no scheme, "www.", path, or trailing slash — tolerant of a bare domain with no scheme. */
export function normalizeDomain(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Digits only (keeping a leading "+" for country code) — tolerant of spaces/dashes/parens formatting. */
export function normalizePhone(value: string): string {
  if (!value) return "";
  const hasPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
}

/** Lowercased, punctuation-stripped, whitespace-collapsed address — good enough for a similarity comparison, not a full postal-address parser. */
export function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical host+path (no scheme, "www.", query string, fragment, or trailing slash) — so two URLs pointing at the same page match despite http/https or trailing-slash formatting differences. */
export function normalizeUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${pathname}`;
  } catch {
    return "";
  }
}

function bigrams(value: string): string[] {
  const cleaned = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) return cleaned ? [cleaned] : [];
  const grams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) grams.push(cleaned.slice(i, i + 2));
  return grams;
}

/**
 * Dice's coefficient over character bigrams — a simple, deterministic,
 * dependency-free fuzzy-match score from 0 (nothing alike) to 1 (identical).
 * Good enough for short strings like company names/addresses; not intended
 * for long-form text.
 */
export function calculateStringSimilarity(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) {
    return bigramsA.length === bigramsB.length ? 1 : 0;
  }

  const remaining = new Map<string, number>();
  for (const gram of bigramsA) remaining.set(gram, (remaining.get(gram) ?? 0) + 1);

  let matches = 0;
  for (const gram of bigramsB) {
    const count = remaining.get(gram) ?? 0;
    if (count > 0) {
      matches += 1;
      remaining.set(gram, count - 1);
    }
  }

  return (2 * matches) / (bigramsA.length + bigramsB.length);
}
