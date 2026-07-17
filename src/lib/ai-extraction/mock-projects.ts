import type { RawSearchResult } from "@/models";
import type { ProjectExtractionContext } from "@/lib/projects/prompt";
import type { ProjectCandidate } from "@/lib/projects/schema";

/** Result domains that are never a real project announcement, regardless of content — same hint list as the customer mock (src/lib/ai-extraction/mock-customers.ts). */
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

const STAGE_KEYWORDS: [RegExp, ProjectCandidate["projectStage"]][] = [
  [/\btender\b/i, "TENDER"],
  [/\bawarded\b|\baward\b/i, "AWARDED"],
  [/\bfeed\b|\bfront[- ]end engineering/i, "FEED"],
  [/\bconstruction\b|\bbreaks ground\b|\bunder construction\b/i, "CONSTRUCTION"],
  [/\bplanning\b|\bproposed\b/i, "PLANNING"],
  [/\bannounc/i, "ANNOUNCED"],
  [/\boperational\b|\bcommissioned\b|\bnow open\b/i, "OPERATIONAL"],
];

const CONTRACTOR_PATTERN = /(?:awarded to|contractor|epc contractor)[:\s]+([A-Z][A-Za-z0-9&' -]{2,40}?)(?=[,.]|\s+(?:expected|for|to|on|in)\b|$)/i;
const TIMELINE_PATTERN = /\b(20\d{2}(?:-20\d{2})?)\b/;

/** Small stable hash (0-1) so mock scores/confidence vary by input but reproduce exactly on rerun. */
function stableUnit(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function clientNameFromTitle(title: string): string {
  return title.split(/\s*[|–-]\s*/)[0].trim();
}

function detectCountry(text: string, knownCountries: string[]): string {
  const lower = text.toLowerCase();
  const match = knownCountries.find((c) => lower.includes(c.toLowerCase()));
  if (match) return match;
  const commonNames = ["USA", "United States", "United Kingdom", "India", "Germany", "UAE", "Canada", "Australia"];
  return commonNames.find((c) => lower.includes(c.toLowerCase())) ?? "";
}

function detectStage(text: string): ProjectCandidate["projectStage"] {
  for (const [pattern, stage] of STAGE_KEYWORDS) {
    if (pattern.test(text)) return stage;
  }
  return "UNKNOWN";
}

/**
 * Deterministic, no-network project extraction used when AI extraction is
 * mocked — same input always produces the same output. Mirrors the shape
 * Claude's structured output would return (see prompt.ts's JSON schema).
 */
export function mockExtractProjectCandidate(
  result: RawSearchResult,
  context: ProjectExtractionContext,
): ProjectCandidate {
  const domain = (result.domain ?? "").replace(/^www\./, "");
  const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => domain.includes(hint));
  const clientName = clientNameFromTitle(result.title);
  const isOwnSite = context.companyName ? clientName.toLowerCase() === context.companyName.toLowerCase() : false;

  if (isExcluded || isOwnSite || !clientName) {
    return {
      isRelevant: false,
      clientName: "",
      projectName: "",
      location: "",
      country: "",
      contractorName: "",
      timeline: "",
      projectInformationLink: "",
      industry: "",
      matchedProductServiceName: "",
      projectStage: "UNKNOWN",
      aiOpportunityExplanation: isExcluded
        ? "Directory/social/news domain, not a project announcement."
        : isOwnSite
          ? "Matches our own company name."
          : "No client/project owner could be inferred from this result.",
      confidenceScore: 0.2,
    };
  }

  const combinedText = `${result.title} ${result.snippet ?? ""}`;
  const projectNameSegments = result.title.split(/\s*[|–-]\s*/);
  const projectName = projectNameSegments.length > 1 ? projectNameSegments.slice(1).join(" - ").trim() : `${clientName} Project`;
  const contractorMatch = combinedText.match(CONTRACTOR_PATTERN);
  const timelineMatch = combinedText.match(TIMELINE_PATTERN);

  return {
    isRelevant: true,
    clientName,
    projectName,
    location: result.country ?? "",
    country: detectCountry(combinedText, context.countriesServed) || (result.country ?? ""),
    contractorName: contractorMatch ? contractorMatch[1].trim() : "",
    timeline: timelineMatch ? timelineMatch[1] : "",
    projectInformationLink: result.url,
    industry: context.targetIndustries[0] ?? "",
    matchedProductServiceName: context.productChoices[0] ?? "",
    projectStage: detectStage(combinedText),
    aiOpportunityExplanation: "Mock extraction — plausible project opportunity based on search result title/snippet.",
    confidenceScore: 0.5 + stableUnit(clientName + projectName) * 0.4,
  };
}
