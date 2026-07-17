import type { SearchResult } from "@/lib/search";
import type { TargetExtractionContext } from "@/lib/target-companies/prompt";
import type { ExtractedTargetCompany } from "@/lib/target-companies/schema";

/** Result domains that are never a real target company, regardless of content. */
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

function titleCompanyName(title: string, domain: string): string {
  const cleaned = title.split(/\s*[|–-]\s*/)[0].trim();
  return cleaned || domain;
}

/**
 * Deterministic, no-network assessment used when AI extraction is mocked
 * (see env.ts) — same input always produces the same output, and always
 * returns exactly one assessment per result (matching the real extractor's
 * contract). Excludes obvious directories/social/news domains, treats
 * everything else as a plausible target with a low confidenceScore
 * signaling this is a placeholder, not a real extraction.
 */
export function mockExtractTargetCompanies(
  results: SearchResult[],
  context: TargetExtractionContext,
  productChoices: string[],
): ExtractedTargetCompany[] {
  return results.map((result): ExtractedTargetCompany => {
    const isExcluded = EXCLUDED_DOMAIN_HINTS.some((hint) => result.domain.includes(hint));
    const companyDomain = result.domain.replace(/^www\./, "");
    const isOwnSite = context.companyName
      ? titleCompanyName(result.title, companyDomain).toLowerCase() === context.companyName.toLowerCase()
      : false;

    if (isExcluded || isOwnSite) {
      return {
        isRelevantTarget: false,
        companyName: "",
        website: "",
        industry: "",
        country: "",
        matchedProduct: "",
        relevanceExplanation: isExcluded
          ? "Directory/social/news domain, not a company site."
          : "Matches our own company name.",
        confidenceScore: 0.2,
      };
    }

    return {
      isRelevantTarget: true,
      companyName: titleCompanyName(result.title, companyDomain),
      website: `https://${companyDomain}`,
      industry: context.industry,
      country: "",
      matchedProduct: productChoices[0] ?? "",
      relevanceExplanation: "Mock extraction — plausible target based on search result domain/title.",
      confidenceScore: 0.2,
    };
  });
}
