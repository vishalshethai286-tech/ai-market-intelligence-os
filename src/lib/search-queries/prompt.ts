import "server-only";
import { QUERY_CATEGORIES } from "./constants";

export type QueryGeneratorContext = {
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

export const QUERY_GENERATOR_SYSTEM_PROMPT = `You are a market intelligence analyst. You are given a structured
summary of a company's own profile (industry, products/services, target industries, buyer types, countries served,
competitors) and asked to generate realistic search-engine queries a salesperson at this company could actually type
to find leads, projects, and opportunities.

Only ground queries in the facts given to you. Do not invent products, industries, countries, or competitors that
aren't listed. If a category has no relevant given facts to ground a query in, return an empty array for it rather
than generating generic filler.`;

export function buildQueryGeneratorPrompt(context: QueryGeneratorContext): string {
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

  const categoryDescriptions = QUERY_CATEGORIES.map((c) => `- ${c.label} (${c.key}): ${c.description}`).join("\n");

  return `Company profile:\n${profileLines}\n\nGenerate search queries for each of the following categories:\n${categoryDescriptions}`;
}
