import type { RawSearchResult } from "@/models";
import type { TenderExtractionContext } from "@/lib/tenders/prompt";
import type { TenderCandidate } from "@/lib/tenders/schema";

/** Result domains that are never a real tender buyer/opportunity, regardless of content — same hint list as the customer/project mocks. */
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

const BUYER_PATTERN = /procurement portal|supplier registration|vendor registration|register as a supplier/i;
const OPPORTUNITY_PATTERN = /\btender for\b|\brfq\b|\brfp\b|\binvitation to bid\b|\btender notice\b/i;
const GENERIC_TENDER_PATTERN = /\btender\b|\bprocurement\b|\bbid\b/i;

const ORG_PATTERN = /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Department|Ministry|Authority|Corporation|Municipality|Council|Board|Agency|Energy|Water|Power|Transport))/;
const TENDER_FOR_PATTERN = /\btender for\s+(.+)$/i;

/** Small stable hash (0-1) so mock scores/confidence/dates vary by input but reproduce exactly on rerun. */
function stableUnit(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/** A deterministic future date (YYYY-MM-DD), floored to the day so repeat calls within the same run always agree. */
function futureDateString(seed: string, minDays: number, maxDays: number): string {
  const days = minDays + Math.floor(stableUnit(seed) * (maxDays - minDays));
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function detectCountry(text: string, knownCountries: string[]): string {
  const lower = text.toLowerCase();
  const match = knownCountries.find((c) => lower.includes(c.toLowerCase()));
  if (match) return match;
  const commonNames = ["USA", "United States", "United Kingdom", "India", "Germany", "UAE", "Qatar", "Saudi Arabia", "Canada", "Australia"];
  return commonNames.find((c) => lower.includes(c.toLowerCase())) ?? "";
}

/** Last "/" or "|" separated segment — buyer/org names in tender-portal titles are typically listed last (e.g. "Supplier Registration | Qatar Energy"), unlike customer/project titles which lead with the name. */
function lastSegment(title: string): string {
  const segments = title.split(/\s*[|/]\s*/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1].trim() : title.trim();
}

function extractTenderTitle(title: string): string {
  const match = title.match(TENDER_FOR_PATTERN);
  return match ? match[1].trim() : title.trim();
}

function extractProductsServicesRequired(tenderTitle: string): string[] {
  return tenderTitle
    .split(/,| and /i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Buyer-portal signals ("procurement portal", "supplier registration") take
 * priority on their own — the generic tender/procurement/bid catch-all only
 * kicks in when there's no buyer signal, so a title like "...Procurement
 * Portal | Qatar Energy" classifies as a pure TENDER_BUYER instead of BOTH
 * just because the word "procurement" also appears in the generic pattern.
 * BOTH is reserved for a buyer page that also names a specific open tender
 * (tender for/RFQ/RFP/invitation to bid/tender notice).
 */
function classify(text: string): "TENDER_BUYER" | "TENDER_OPPORTUNITY" | "BOTH" | "NONE" {
  const isBuyer = BUYER_PATTERN.test(text);
  const hasExplicitOpportunity = OPPORTUNITY_PATTERN.test(text);
  if (isBuyer && hasExplicitOpportunity) return "BOTH";
  if (isBuyer) return "TENDER_BUYER";
  if (hasExplicitOpportunity || GENERIC_TENDER_PATTERN.test(text)) return "TENDER_OPPORTUNITY";
  return "NONE";
}

/**
 * Deterministic, no-network tender extraction used when AI extraction is
 * mocked — same input always produces the same output. Mirrors the shape
 * Claude's structured output would return (see prompt.ts's JSON schema).
 * Handles the buyer-portal case ("Supplier Registration | Qatar Energy") and
 * the live-opportunity case ("Tender for Stainless Steel Pipes and
 * Fittings") from the Phase 10 spec's worked examples.
 */
export function mockExtractTenderCandidate(result: RawSearchResult, context: TenderExtractionContext): TenderCandidate {
  const domain = (result.domain ?? "").replace(/^www\./, "");
  const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => domain.includes(hint));
  const combinedText = `${result.title} ${result.snippet ?? ""}`;
  const isOwnSite = context.companyName ? combinedText.toLowerCase().includes(context.companyName.toLowerCase()) && lastSegment(result.title).toLowerCase() === context.companyName.toLowerCase() : false;

  const extractionType = isExcluded || isOwnSite ? "NONE" : classify(combinedText);

  if (extractionType === "NONE") {
    return {
      isRelevant: false,
      extractionType: "NONE",
      customerName: "",
      country: "",
      address: "",
      phoneNumber: "",
      website: "",
      tenderWebsiteLink: "",
      buyerOrganization: "",
      tenderTitle: "",
      tenderDescription: "",
      startDate: "",
      endDate: "",
      tenderLink: "",
      productsServicesRequired: [],
      matchedProductServiceName: "",
      aiTenderExplanation: isExcluded
        ? "Directory/social/news domain, not a tender buyer or opportunity."
        : isOwnSite
          ? "Matches our own company name."
          : "No tender buyer or opportunity could be inferred from this result.",
      confidenceScore: 0.2,
    };
  }

  const country = detectCountry(combinedText, context.countriesServed) || (result.country ?? "");
  const customerName = lastSegment(result.title);
  const orgMatch = combinedText.match(ORG_PATTERN);
  const tenderTitle = extractTenderTitle(result.title);

  return {
    isRelevant: true,
    extractionType,
    customerName,
    country,
    address: "",
    phoneNumber: "",
    website: domain ? `https://${domain}` : "",
    tenderWebsiteLink: extractionType === "TENDER_BUYER" || extractionType === "BOTH" ? result.url : "",
    buyerOrganization: orgMatch ? orgMatch[1].trim() : customerName,
    tenderTitle: extractionType === "TENDER_OPPORTUNITY" || extractionType === "BOTH" ? tenderTitle : "",
    tenderDescription: extractionType === "TENDER_OPPORTUNITY" || extractionType === "BOTH" ? result.snippet ?? "" : "",
    startDate: "",
    endDate: extractionType === "TENDER_OPPORTUNITY" || extractionType === "BOTH" ? futureDateString(result.id + result.title, 14, 60) : "",
    tenderLink: extractionType === "TENDER_OPPORTUNITY" || extractionType === "BOTH" ? result.url : "",
    productsServicesRequired: extractionType === "TENDER_OPPORTUNITY" || extractionType === "BOTH" ? extractProductsServicesRequired(tenderTitle) : [],
    matchedProductServiceName: context.productChoices[0] ?? "",
    aiTenderExplanation: "Mock extraction — plausible tender buyer/opportunity based on search result title/snippet.",
    confidenceScore: 0.5 + stableUnit(customerName + tenderTitle) * 0.4,
  };
}
