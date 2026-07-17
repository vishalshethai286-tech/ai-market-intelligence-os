import { normalizeDomain, normalizePhone as normalizePhoneGeneric } from "@/lib/dedup/normalize";
import type { ContactRoleCategory, ContactSeniority, ContactSourceType } from "@/models";

/** sourceType values that are NOT a public-discovery source — a human either typed the contact in directly or imported it from a spreadsheet. Kept as one array so the in-memory predicate below and any Mongo `$nin` query filter can never drift apart. */
const NON_PUBLIC_SOURCE_TYPES: readonly ContactSourceType[] = ["MANUAL_ENTRY", "CSV_IMPORT"];

/** Mongo query filter for "publicly discovered contacts" — spread into a `ContactModel.countDocuments`/`find` filter as `{ sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER }`. */
export const PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER = { $nin: NON_PUBLIC_SOURCE_TYPES } as const;

/** A contact is "publicly discovered" if its sourceType is anything other than a manual/import path — the single source of truth for the public-vs-manual distinction shown across the Contacts list, Contact Discovery page, reports, and exports. */
export function isPubliclyDiscoveredContact(sourceType: ContactSourceType): boolean {
  return !NON_PUBLIC_SOURCE_TYPES.includes(sourceType);
}

/** Lowercased, punctuation-stripped, whitespace-collapsed name — the basis for a "same person" comparison. Not for display (use fullName/firstName/lastName as-is for that). */
export function normalizeContactName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a display full name into first/last name for storage — takes the
 * first token as firstName and everything else as lastName, since that's
 * right for the overwhelming majority of Western-order names this app's
 * discovery sources produce; a single-token name has no lastName.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Lowercased, trimmed email — the basis for a "same person" comparison and for storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Re-exported under contact-domain naming for clarity at call sites — same canonical implementation as src/lib/dedup/normalize.ts (Phase 8), reused by every other duplicate-detection module in this codebase. */
export function normalizePhone(value: string): string {
  return normalizePhoneGeneric(value);
}

/** Canonical `linkedin.com/in/<handle>` form — no scheme, "www.", query string, trailing slash, or locale subdomain, so the same profile always normalizes identically regardless of how the URL was copied. */
export function normalizeLinkedInUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("linkedin.com")) return "";
    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `linkedin.com${pathname}`;
  } catch {
    return "";
  }
}

/** Re-exported under contact-domain naming for clarity — same canonical implementation as src/lib/dedup/normalize.ts. */
export function normalizeCompanyDomain(value: string): string {
  return normalizeDomain(value);
}

/** Lowercased, punctuation-stripped, whitespace-collapsed designation/job-title — the basis for role/seniority inference. */
export function normalizeDesignation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ordered so the most specific/multi-word phrases are checked before a
 * looser single-word one could shadow them (e.g. "supply chain" before a
 * bare "chain", "vendor" before a generic "management" catch-all).
 */
const ROLE_CATEGORY_KEYWORDS: [pattern: RegExp, category: ContactRoleCategory][] = [
  [/supply chain/, "SUPPLY_CHAIN"],
  [/vendor/, "VENDOR_MANAGEMENT"],
  [/procurement/, "PROCUREMENT"],
  [/purchas/, "PURCHASE"],
  [/sourcing/, "SOURCING"],
  [/contract/, "CONTRACTS"],
  [/tender/, "TENDERING"],
  [/project/, "PROJECT_MANAGEMENT"],
  [/plant/, "PLANT_OPERATIONS"],
  [/maintenance/, "MAINTENANCE"],
  [/operations/, "OPERATIONS"],
  [/quality/, "QUALITY"],
  [/technical/, "TECHNICAL"],
  [/engineer/, "ENGINEERING"],
  [/commercial/, "COMMERCIAL"],
  [/finance|accounts?\b/, "FINANCE"],
  [/admin/, "ADMINISTRATION"],
  [/management|managing director|general manager|ceo|chief executive|president|owner/, "MANAGEMENT"],
];

/** Infers the ContactRoleCategory from a free-text designation/job-title — deterministic keyword matching, no AI. Falls back to OTHER when nothing matches. */
export function inferRoleCategoryFromDesignation(designation: string): ContactRoleCategory {
  const normalized = normalizeDesignation(designation);
  if (!normalized) return "OTHER";
  const match = ROLE_CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : "OTHER";
}

/** Checked in this order so a more senior keyword occurring earlier in a compound title (rare) still wins deterministically; each designation gets exactly one seniority. */
const SENIORITY_KEYWORDS: [pattern: RegExp, seniority: ContactSeniority][] = [
  [/owner/, "OWNER"],
  [/president/, "PRESIDENT"],
  [/\bceo\b|chief executive/, "CEO"],
  [/director/, "DIRECTOR"],
  [/\bvp\b|vice president/, "VP"],
  [/head/, "HEAD"],
  [/manager/, "MANAGER"],
  [/engineer/, "ENGINEER"],
  [/executive/, "EXECUTIVE"],
  [/officer/, "OFFICER"],
  [/coordinator/, "COORDINATOR"],
];

/** Infers the ContactSeniority from a free-text designation/job-title — deterministic keyword matching, no AI. Falls back to UNKNOWN when nothing matches. */
export function inferSeniorityFromDesignation(designation: string): ContactSeniority {
  const normalized = normalizeDesignation(designation);
  if (!normalized) return "UNKNOWN";
  const match = SENIORITY_KEYWORDS.find(([pattern]) => pattern.test(normalized));
  return match ? match[1] : "UNKNOWN";
}

/**
 * Same email, or same LinkedIn URL, in the same workspace is a strong
 * signal of "same person" — keyed on whichever is available (email first,
 * the single most reliable identifier for a contact). Falling back to
 * fullName+companyDomain, then fullName alone, is progressively weaker
 * (kept as separate keys so they never collide with the strong ones).
 */
export function buildContactDuplicateKey(
  workspaceId: string,
  fullName: string,
  email: string,
  linkedinUrl: string,
  companyDomain: string,
): string {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) return `${workspaceId}:email:${normalizedEmail}`;
  const normalizedLinkedIn = normalizeLinkedInUrl(linkedinUrl);
  if (normalizedLinkedIn) return `${workspaceId}:linkedin:${normalizedLinkedIn}`;
  const normalizedName = normalizeContactName(fullName);
  const normalizedDomain = normalizeCompanyDomain(companyDomain);
  if (normalizedDomain) return `${workspaceId}:name-domain:${normalizedName}:${normalizedDomain}`;
  return `${workspaceId}:name:${normalizedName}`;
}
