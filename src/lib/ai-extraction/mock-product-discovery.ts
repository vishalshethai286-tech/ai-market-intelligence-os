import type { ExtractedProductService } from "@/lib/product-discovery/schema";
import type { PageContent } from "@/lib/product-discovery/types";

const SERVICE_HINTS = ["service", "services", "consulting", "support", "maintenance", "repair", "installation"];

function guessType(name: string): "PRODUCT" | "SERVICE" {
  const lower = name.toLowerCase();
  return SERVICE_HINTS.some((hint) => lower.includes(hint)) ? "SERVICE" : "PRODUCT";
}

/**
 * Deterministic, no-network extraction used when AI extraction is mocked
 * (see env.ts) — same input always produces the same output. Turns each
 * page's title into one placeholder catalog entry (skipping the homepage,
 * whose title is usually the company name, not a product) rather than
 * attempting real content understanding, with a low confidenceScore
 * signaling this is a placeholder, not a real extraction.
 */
export function mockExtractProductServices(pages: PageContent[]): ExtractedProductService[] {
  return pages
    .slice(1)
    .filter((page) => Boolean(page.title))
    .map((page): ExtractedProductService => {
      const name = page.title!.split(/\s*[|–-]\s*/)[0].trim();
      return {
        name: name || page.url,
        type: guessType(name),
        category: "",
        subcategory: "",
        description: "",
        applications: [],
        targetIndustries: [],
        buyerTypes: [],
        keywords: [],
        synonyms: [],
        relatedProductsServices: [],
        projectKeywords: [],
        tenderKeywords: [],
        vendorRegistrationKeywords: [],
        sourceUrls: [page.url],
        confidenceScore: 0.2,
      };
    });
}
