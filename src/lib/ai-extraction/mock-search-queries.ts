import { QUERY_CATEGORIES } from "@/lib/search-queries/constants";
import type { QueryGeneratorContext } from "@/lib/search-queries/prompt";
import type { GeneratedQueriesByCategory } from "@/lib/search-queries/schema";

/**
 * Deterministic, no-network query generation used when AI extraction is
 * mocked (see env.ts) — same input always produces the same output. Builds
 * one templated query per grounding fact per category (capped at 3), and an
 * empty array for a category with nothing to ground a query in — same
 * "don't invent facts" contract as the real generator.
 */
export function mockGenerateSearchQueries(context: QueryGeneratorContext): GeneratedQueriesByCategory {
  const result: GeneratedQueriesByCategory = {};
  const base = context.industry || context.companyName;

  for (const { key, category } of QUERY_CATEGORIES) {
    switch (category) {
      case "TARGET_CUSTOMER":
        result[key] = base
          ? [{ query: `companies that need ${base}`, basedOn: `Industry: ${base}` }]
          : [];
        break;
      case "BUYER_TYPE":
        result[key] = context.buyerTypes.slice(0, 3).map((buyerType) => ({
          query: `${buyerType} buying ${base || "industrial products"}`,
          basedOn: `Buyer type: ${buyerType}`,
        }));
        break;
      case "INDUSTRY_COMPANY":
        result[key] = context.targetIndustries.slice(0, 3).map((industry) => ({
          query: `companies in ${industry}`,
          basedOn: `Target industry: ${industry}`,
        }));
        break;
      case "PRODUCT_SERVICE_BUYER":
        result[key] = context.products.slice(0, 3).map((product) => ({
          query: `buy ${product}`,
          basedOn: `Product/service: ${product}`,
        }));
        break;
      case "COUNTRY_SPECIFIC":
        result[key] = context.countriesServed.slice(0, 3).map((country) => ({
          query: `${base || "suppliers"} in ${country}`,
          basedOn: `Country served: ${country}`,
        }));
        break;
      case "VENDOR_REGISTRATION":
        result[key] = base
          ? [{ query: `vendor registration portal ${base}`, basedOn: `Industry: ${base}` }]
          : [];
        break;
      case "PROJECT":
        result[key] = base
          ? [{ query: `active projects requiring ${base}`, basedOn: `Industry: ${base}` }]
          : [];
        break;
      default:
        result[key] = [];
    }
  }

  return result;
}
