import type { RawSearchResult } from "@/models";
import type { VendorRegistrationExtractionContext } from "@/lib/vendor-registrations/prompt";
import type { VendorRegistrationCandidate } from "@/lib/vendor-registrations/schema";

/** Result domains that are never a real vendor registration opportunity, regardless of content — same hint list as the customer/tender mocks. */
const EXCLUDED_DOMAIN_HINTS = [
  "wikipedia.org",
  "linkedin.com",
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

const SUPPLIER_PORTAL_PATTERN = /supplier registration|vendor registration|supplier portal/i;
const VENDOR_ONBOARDING_PATTERN = /become a supplier|become a vendor|vendor onboarding/i;
const PROCUREMENT_PORTAL_PATTERN = /procurement portal/i;
const PREQUALIFICATION_PATTERN = /prequalification|pre-qualification/i;
const GENERIC_RELEVANCE_PATTERN = /vendor|supplier|procurement/i;

/** Canonical document labels detected from a snippet's free text, in a fixed reporting order so mock output is deterministic regardless of the order they're mentioned. */
const DOCUMENT_KEYWORDS: [pattern: RegExp, label: string][] = [
  [/company profile/i, "Company profile"],
  [/iso certificate/i, "ISO certificate"],
  [/trade licen[cs]e/i, "Trade license"],
  [/product catalog/i, "Product catalog"],
  [/certificate of incorporation/i, "Certificate of incorporation"],
  [/tax registration certificate/i, "Tax registration certificate"],
  [/bank reference letter/i, "Bank reference letter"],
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

/** Last "/" or "|" separated segment — buyer/org names in registration-portal titles are typically listed last (e.g. "Supplier Registration | ADNOC"), unlike customer/project mocks which use the first. */
function lastSegment(title: string): string {
  const segments = title.split(/\s*[|/]\s*/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1].trim() : title.trim();
}

function detectRegistrationType(text: string): string {
  if (SUPPLIER_PORTAL_PATTERN.test(text)) return "Supplier Portal";
  if (VENDOR_ONBOARDING_PATTERN.test(text)) return "Vendor Onboarding";
  if (PROCUREMENT_PORTAL_PATTERN.test(text)) return "Procurement Portal";
  if (PREQUALIFICATION_PATTERN.test(text)) return "Prequalification";
  return "";
}

function detectRequiredDocuments(text: string): string[] {
  return DOCUMENT_KEYWORDS.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

/**
 * Deterministic, no-network vendor-registration extraction used when AI
 * extraction is mocked — same input always produces the same output.
 * Handles the "Supplier Registration | ADNOC" and "Become a Supplier |
 * SABIC" worked examples from the Phase 11 spec.
 */
export function mockExtractVendorRegistrationCandidate(
  result: RawSearchResult,
  context: VendorRegistrationExtractionContext,
): VendorRegistrationCandidate {
  const domain = (result.domain ?? "").replace(/^www\./, "");
  const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => domain.includes(hint));
  const combinedText = `${result.title} ${result.snippet ?? ""}`;
  const isOwnSite = context.companyName
    ? combinedText.toLowerCase().includes(context.companyName.toLowerCase()) && lastSegment(result.title).toLowerCase() === context.companyName.toLowerCase()
    : false;

  const registrationType = detectRegistrationType(combinedText);
  const isRelevant = !isExcluded && !isOwnSite && (registrationType !== "" || GENERIC_RELEVANCE_PATTERN.test(combinedText));

  if (!isRelevant) {
    return {
      isRelevant: false,
      customerName: "",
      country: "",
      address: "",
      phoneNumber: "",
      website: "",
      vendorRegistrationLink: "",
      registrationType: "",
      requiredDocuments: [],
      matchedProductServiceName: "",
      aiVendorRegistrationExplanation: isExcluded
        ? "Directory/social/news domain, not a vendor registration opportunity."
        : isOwnSite
          ? "Matches our own company name."
          : "No vendor registration opportunity could be inferred from this result.",
      confidenceScore: 0.2,
    };
  }

  const country = detectCountry(combinedText, context.countriesServed) || (result.country ?? "");
  const customerName = lastSegment(result.title);

  return {
    isRelevant: true,
    customerName,
    country,
    address: "",
    phoneNumber: "",
    website: domain ? `https://${domain}` : "",
    vendorRegistrationLink: result.url,
    registrationType,
    requiredDocuments: detectRequiredDocuments(combinedText),
    matchedProductServiceName: context.productChoices[0] ?? "",
    aiVendorRegistrationExplanation: "Mock extraction — plausible vendor registration opportunity based on search result title/snippet.",
    confidenceScore: 0.5 + stableUnit(customerName + registrationType) * 0.4,
  };
}
