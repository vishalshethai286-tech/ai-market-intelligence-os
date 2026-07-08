import "server-only";
import type { SearchResult } from "@/lib/search";

export type TargetExtractionContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  products: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
  keywords: string[];
  competitors: string[];
};

export const EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst evaluating raw web search results to
decide which represent genuine potential target companies (leads) for OUR company, given OUR company profile.

For each search result, decide whether it plausibly represents a real, distinct company that could be a customer or
target for us. Exclude directory/aggregator listings, news articles, blog posts, generic marketplaces, social media
profiles, our own company's website, and known competitors' own websites (a competitor's site is not a lead, even
though it's relevant background). Only extract company details you can actually infer from the title, snippet, or
domain given — never guess or invent a company name, website, industry, or country that isn't supported by the
result. Return exactly one assessment per result, in the same order they were given.`;

export function buildExtractionPrompt(results: SearchResult[], context: TargetExtractionContext): string {
  const profileLines = [
    `Company name: ${context.companyName || "(unknown)"}`,
    `Industry: ${context.industry || "(unknown)"}`,
    `Business description: ${context.businessDescription || "(none)"}`,
    `Products/services: ${context.products.join(", ") || "(none)"}`,
    `Target industries: ${context.targetIndustries.join(", ") || "(none)"}`,
    `Buyer types: ${context.buyerTypes.join(", ") || "(none)"}`,
    `Countries served: ${context.countriesServed.join(", ") || "(none)"}`,
    `Keywords: ${context.keywords.join(", ") || "(none)"}`,
    `Known competitors: ${context.competitors.join(", ") || "(none)"}`,
  ].join("\n");

  const resultLines = results
    .map(
      (result, index) =>
        `Result ${index + 1}:\nTitle: ${result.title}\nSnippet: ${result.snippet}\nURL: ${result.url}\nDomain: ${result.domain}`,
    )
    .join("\n\n");

  return `Our company profile:\n${profileLines}\n\nSearch results to evaluate (${results.length} total):\n\n${resultLines}\n\nAssess each of the ${results.length} results above, in order.`;
}
