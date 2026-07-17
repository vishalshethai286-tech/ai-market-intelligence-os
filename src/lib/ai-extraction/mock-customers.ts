import type { RawSearchResult } from "@/models";
import type { CustomerExtractionContext } from "@/lib/customers/prompt";
import type { CustomerCandidate } from "@/lib/customers/schema";

/** Result domains that are never a real target company, regardless of content — same hint list as the older target-companies mock (src/lib/ai-extraction/mock-target-companies.ts). */
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
  "bloomberg.com",
  "reuters.com",
  "news.",
  "directory.",
];

const BUYER_TYPE_KEYWORDS: Record<string, string> = {
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  wholesaler: "Wholesaler",
  retailer: "Retailer",
  supplier: "Supplier",
  contractor: "Contractor",
  "oem": "OEM",
};

const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;

/** Small stable hash (0-1) so mock scores/confidence vary by input but reproduce exactly on rerun. */
function stableUnit(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function companyNameFromTitle(title: string): string {
  return title.split(/\s*[|–-]\s*/)[0].trim();
}

function detectCountry(text: string, knownCountries: string[]): string {
  const lower = text.toLowerCase();
  const match = knownCountries.find((c) => lower.includes(c.toLowerCase()));
  if (match) return match;
  // Common fallback for the mock's own example fixtures — not a real geo lookup.
  const commonNames = ["USA", "United States", "United Kingdom", "India", "Germany", "UAE", "Canada", "Australia"];
  return commonNames.find((c) => lower.includes(c.toLowerCase())) ?? "";
}

function detectBuyerType(text: string, knownBuyerTypes: string[]): string {
  const lower = text.toLowerCase();
  for (const [keyword, label] of Object.entries(BUYER_TYPE_KEYWORDS)) {
    if (lower.includes(keyword)) return label;
  }
  return knownBuyerTypes[0] ?? "";
}

/**
 * Deterministic, no-network customer extraction used when AI extraction is
 * mocked — same input always produces the same output. Mirrors the shape
 * Claude's structured output would return (see prompt.ts's JSON schema).
 */
export function mockExtractCustomerCandidate(
  result: RawSearchResult,
  context: CustomerExtractionContext,
): CustomerCandidate {
  const domain = (result.domain ?? "").replace(/^www\./, "");
  const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => domain.includes(hint));
  const customerName = companyNameFromTitle(result.title);
  const isOwnSite = context.companyName ? customerName.toLowerCase() === context.companyName.toLowerCase() : false;

  if (isExcluded || isOwnSite || !customerName) {
    return {
      isRealCompany: !isExcluded,
      isTargetCustomer: false,
      customerName: "",
      country: "",
      website: "",
      address: "",
      phoneNumber: "",
      matchedProductServiceName: "",
      matchedIndustry: "",
      buyerType: "",
      aiRelevanceExplanation: isExcluded
        ? "Directory/social/news domain, not a company site."
        : isOwnSite
          ? "Matches our own company name."
          : "No company name could be inferred from this result.",
      confidenceScore: 0.2,
    };
  }

  const combinedText = `${result.title} ${result.snippet ?? ""}`;
  const phoneMatch = combinedText.match(PHONE_PATTERN);

  return {
    isRealCompany: true,
    isTargetCustomer: true,
    customerName,
    country: detectCountry(combinedText, context.countriesServed) || (result.country ?? ""),
    website: domain ? `https://${domain}` : "",
    address: "",
    phoneNumber: phoneMatch ? phoneMatch[1].trim() : "",
    matchedProductServiceName: context.productChoices[0] ?? "",
    matchedIndustry: context.targetIndustries[0] ?? "",
    buyerType: detectBuyerType(combinedText, context.buyerTypes),
    aiRelevanceExplanation: "Mock extraction — plausible target customer based on search result title/domain.",
    confidenceScore: 0.5 + stableUnit(customerName) * 0.4,
  };
}
