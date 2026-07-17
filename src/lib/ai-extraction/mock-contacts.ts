import type { RawSearchResult } from "@/models";
import type { ContactRoleCategory, ContactSeniority, ContactSourceType } from "@/models";
import type { ContactExtractionContext } from "@/lib/contact-discovery/prompt";
import type { PublicContactExtraction, ContactCandidate } from "@/lib/contact-discovery/schema";
import { inferRoleCategoryFromDesignation, inferSeniorityFromDesignation } from "@/lib/contacts/normalize";

/** Result domains that are never a real public contact source, regardless of content — same hint list as every other mock extractor in this codebase, plus every LinkedIn domain (never scraped, per standing policy — a LinkedIn URL may only be *stored* if it was already plainly present in another public page's text, never extracted from a LinkedIn page itself). */
const EXCLUDED_DOMAIN_HINTS = [
  "linkedin.com",
  "wikipedia.org",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "yelp.com",
  "indeed.com",
  "glassdoor.com",
  "crunchbase.com",
  "directory.",
];

const GENERIC_RELEVANCE_PATTERN = /procurement|purchase|purchasing|sourcing|supplier|vendor|tender|contracts|project manager|engineering manager|plant manager|operations manager|management team/i;

/**
 * Matches a "Firstname Lastname, Designation" pattern anywhere in the
 * combined title+snippet text — can match more than once, so a single
 * result naming several people yields one contact per match. The leading
 * negative lookahead stops a generic lead-in word ("Contact John Doe, ...")
 * from being greedily absorbed into the captured name — without it, a
 * capitalized sentence like "Contact John Doe, Plant Manager" would wrongly
 * capture "Contact John Doe" as the fullName instead of "John Doe".
 */
const NAMED_CONTACT_LEAD_IN_EXCLUSIONS = "Contact|Meet|Email|Call|Reach|Management|Team|Supplier|Vendor|Procurement|Tender|Our";
const NAMED_CONTACT_PATTERN = new RegExp(
  `\\b(?!(?:${NAMED_CONTACT_LEAD_IN_EXCLUSIONS})\\b)([A-Z][a-z]+(?:\\s[A-Z][a-z]+){1,2}),\\s*([A-Za-z][A-Za-z\\s]{2,50}?)(?=\\s*[|/]|\\s*[.,]|\\s*$)`,
  "g",
);

type DepartmentPattern = {
  pattern: RegExp;
  fullName: string;
  designation: string;
  department: string;
  roleCategory: ContactRoleCategory;
  sourceType: ContactSourceType;
};

/** Checked in order; only the first match is used as a department/team contact (see extractContacts below) — avoids over-generating near-duplicate department entries when several keywords appear in the same result. */
const DEPARTMENT_PATTERNS: DepartmentPattern[] = [
  {
    pattern: /supplier registration/i,
    fullName: "Supplier Registration Team",
    designation: "Supplier Registration Contact",
    department: "Procurement",
    roleCategory: "VENDOR_MANAGEMENT",
    sourceType: "SUPPLIER_PORTAL",
  },
  {
    pattern: /vendor (portal|management)/i,
    fullName: "Vendor Portal Helpdesk",
    designation: "Vendor Portal Contact",
    department: "Procurement",
    roleCategory: "VENDOR_MANAGEMENT",
    sourceType: "SUPPLIER_PORTAL",
  },
  {
    pattern: /procurement (contact|department|team)|procurement contacts/i,
    fullName: "Procurement Department",
    designation: "Procurement Contact",
    department: "Procurement",
    roleCategory: "PROCUREMENT",
    sourceType: "PROCUREMENT_PAGE",
  },
  {
    pattern: /tender contact|contracts department|bid contact/i,
    fullName: "Tender Contact Desk",
    designation: "Tender Contact",
    department: "Contracts",
    roleCategory: "TENDERING",
    sourceType: "TENDER_DOCUMENT",
  },
  {
    pattern: /management team/i,
    fullName: "Management Team",
    designation: "Management Contact",
    department: "Management",
    roleCategory: "MANAGEMENT",
    sourceType: "TEAM_PAGE",
  },
];

/** Small stable hash (0-1) so mock confidence varies by input but reproduces exactly on rerun. */
function stableUnit(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function detectCountry(text: string, knownCountries: string[]): string {
  const lower = text.toLowerCase();
  const match = knownCountries.find((c) => lower.includes(c.toLowerCase()));
  if (match) return match;
  const commonNames = ["USA", "United States", "United Kingdom", "India", "Germany", "United Arab Emirates", "Saudi Arabia", "Qatar", "Canada", "Australia"];
  return commonNames.find((c) => lower.includes(c.toLowerCase())) ?? "";
}

/** Last "/" or "|" separated segment — company names in contact-page titles are typically listed last (e.g. "Supplier Registration Contact | ADNOC"), unlike customer/project mocks which use the first. */
function lastSegment(title: string): string {
  const segments = title.split(/\s*[|/]\s*/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1].trim() : title.trim();
}

function detectSourceType(text: string): ContactSourceType {
  if (/tender|bid/i.test(text)) return "TENDER_DOCUMENT";
  if (/supplier portal|vendor portal|supplier registration|vendor registration|onboarding/i.test(text)) return "SUPPLIER_PORTAL";
  if (/procurement/i.test(text)) return "PROCUREMENT_PAGE";
  if (/conference|speaker/i.test(text)) return "CONFERENCE_PAGE";
  if (/management team|\bteam\b/i.test(text)) return "TEAM_PAGE";
  if (/\bcontact\b/i.test(text)) return "CONTACT_PAGE";
  return "COMPANY_WEBSITE";
}

/** Publicly-visible email/phone/LinkedIn found verbatim in the text — never invented, per standing policy. Simple pattern matches only. */
function extractEmail(text: string): string {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
}
function extractPhone(text: string): string {
  return text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0]?.trim() ?? "";
}
function extractLinkedInUrl(text: string): string {
  return text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?/)?.[0] ?? "";
}

function buildCandidate(
  fields: {
    fullName: string;
    designation: string;
    department: string;
    roleCategory: ContactRoleCategory;
    seniority: ContactSeniority;
    sourceType: ContactSourceType;
  },
  combinedText: string,
  result: RawSearchResult,
  context: ContactExtractionContext,
  domain: string,
): ContactCandidate {
  const companyName = context.companyName || lastSegment(result.title);
  const country = context.country || detectCountry(combinedText, []) || result.country || "";

  return {
    fullName: fields.fullName,
    companyName,
    companyWebsite: context.companyWebsite || (domain ? `https://${domain}` : ""),
    designation: fields.designation,
    department: fields.department,
    roleCategory: fields.roleCategory,
    seniority: fields.seniority,
    email: extractEmail(combinedText),
    phoneNumber: extractPhone(combinedText),
    mobileNumber: "",
    linkedinUrl: extractLinkedInUrl(combinedText),
    country,
    location: "",
    sourceUrl: result.url,
    sourceType: fields.sourceType,
    confidenceScore: 0.5 + stableUnit(fields.fullName + fields.designation) * 0.4,
    aiContactExplanation: "Mock extraction — plausible public business contact based on search result title/snippet.",
  };
}

function extractContacts(combinedText: string, result: RawSearchResult, context: ContactExtractionContext, domain: string): ContactCandidate[] {
  const sourceType = detectSourceType(combinedText);
  const namedMatches = [...combinedText.matchAll(NAMED_CONTACT_PATTERN)];

  const namedContacts: ContactCandidate[] = namedMatches.map((match) => {
    const fullName = match[1].trim();
    const designation = match[2].trim();
    return buildCandidate(
      {
        fullName,
        designation,
        department: "",
        roleCategory: inferRoleCategoryFromDesignation(designation),
        seniority: inferSeniorityFromDesignation(designation),
        sourceType,
      },
      combinedText,
      result,
      context,
      domain,
    );
  });

  const usedRoleCategories = new Set(namedContacts.map((c) => c.roleCategory));
  const departmentMatch = DEPARTMENT_PATTERNS.find((p) => p.pattern.test(combinedText) && !usedRoleCategories.has(p.roleCategory));

  const contacts = [...namedContacts];
  if (departmentMatch) {
    contacts.push(
      buildCandidate(
        {
          fullName: departmentMatch.fullName,
          designation: departmentMatch.designation,
          department: departmentMatch.department,
          roleCategory: departmentMatch.roleCategory,
          seniority: "UNKNOWN",
          sourceType: departmentMatch.sourceType,
        },
        combinedText,
        result,
        context,
        domain,
      ),
    );
  }

  return contacts;
}

/**
 * Deterministic, no-network public-contact extraction used when AI
 * extraction is mocked — same input always produces the same output. Never
 * invents an email/phone/LinkedIn URL (only pulls one out of the text if
 * it's literally present), never extracts from an excluded (directory/
 * social/LinkedIn) domain, and can return more than one contact per result.
 * Handles the "Supplier Registration Contact | ADNOC" (department contact)
 * and "Jane Smith, Procurement Manager | ABC Pumps" (named contact) worked
 * examples from the Phase 11.5B spec.
 */
export function mockExtractPublicContacts(result: RawSearchResult, context: ContactExtractionContext): PublicContactExtraction {
  const domain = (result.domain ?? "").replace(/^www\./, "");
  const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => domain.includes(hint));
  const combinedText = `${result.title} ${result.snippet ?? ""}`;

  if (isExcluded) {
    return { isRelevant: false, contacts: [] };
  }

  const contacts = extractContacts(combinedText, result, context, domain);
  const isRelevant = contacts.length > 0 || GENERIC_RELEVANCE_PATTERN.test(combinedText);

  if (!isRelevant) {
    return { isRelevant: false, contacts: [] };
  }

  return { isRelevant: true, contacts };
}
