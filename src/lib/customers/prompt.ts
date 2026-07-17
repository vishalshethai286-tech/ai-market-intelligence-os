import "server-only";
import type { RawSearchResult } from "@/models";

export type CustomerExtractionContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  productChoices: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
};

export const CUSTOMER_EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst evaluating one raw web search
result to decide whether it represents a genuine potential target customer for OUR company, given OUR company
profile. Exclude directory/aggregator listings, news articles, blog posts, generic marketplaces, social media
profiles, and our own company's website. Only extract details (name, country, website, address, phone number) you
can actually infer from the title, snippet, or URL given — never guess or invent a value that isn't supported by the
result; use an empty string for anything you can't infer.`;

export function buildCustomerExtractionPrompt(result: RawSearchResult, context: CustomerExtractionContext): string {
  const profileLines = [
    `Company name: ${context.companyName || "(unknown)"}`,
    `Industry: ${context.industry || "(unknown)"}`,
    `Business description: ${context.businessDescription || "(none)"}`,
    `Products/services we offer: ${context.productChoices.join(", ") || "(none)"}`,
    `Target industries: ${context.targetIndustries.join(", ") || "(none)"}`,
    `Buyer types: ${context.buyerTypes.join(", ") || "(none)"}`,
    `Countries served: ${context.countriesServed.join(", ") || "(none)"}`,
  ].join("\n");

  return `Our company profile:\n${profileLines}\n\nSearch result to evaluate:\nTitle: ${result.title}\nSnippet: ${result.snippet ?? ""}\nURL: ${result.url}\nDomain: ${result.domain ?? ""}\nCountry hint: ${result.country ?? ""}\n\nAssess this result.`;
}

/** JSON Schema for output_config.format — matches CustomerCandidateSchema in schema.ts. `matchedProductServiceName` is constrained to what we actually offer so the model can't invent a product. */
export function buildCustomerExtractionJsonSchema(productChoices: string[]) {
  return {
    type: "object",
    properties: {
      isRealCompany: {
        type: "boolean",
        description: "True only if this result plausibly represents a real, distinct company — not a directory, news article, blog post, marketplace, or social media profile.",
      },
      isTargetCustomer: {
        type: "boolean",
        description: "True only if, assuming isRealCompany, this company is plausibly a customer/buyer for OUR products/services (not a competitor, not our own site).",
      },
      customerName: { type: "string", description: "The company's name, if inferable. Empty string if not." },
      country: { type: "string", description: "The country this company appears to be based in, if inferable. Empty string if not — never guess." },
      website: { type: "string", description: "The company's own website URL, if inferable. Empty string if not." },
      address: { type: "string", description: "A public postal/street address, only if explicitly present in the title/snippet. Empty string otherwise." },
      phoneNumber: { type: "string", description: "A public phone number, only if explicitly present in the title/snippet. Empty string otherwise." },
      matchedProductServiceName: {
        type: "string",
        enum: [...productChoices, ""],
        description: "Which of our given products/services this company seems to be a fit for. Empty string if unclear.",
      },
      matchedIndustry: { type: "string", description: "The company's industry, if inferable. Empty string if not." },
      buyerType: { type: "string", description: "What kind of buyer this company appears to be (e.g. OEM, Distributor, End User), if inferable. Empty string if not." },
      aiRelevanceExplanation: { type: "string", description: "One or two sentences on why this is (or isn't) a relevant target customer." },
      confidenceScore: { type: "number", description: "0 to 1: your confidence that the fields above are correct." },
    },
    required: [
      "isRealCompany",
      "isTargetCustomer",
      "customerName",
      "country",
      "website",
      "address",
      "phoneNumber",
      "matchedProductServiceName",
      "matchedIndustry",
      "buyerType",
      "aiRelevanceExplanation",
      "confidenceScore",
    ],
    additionalProperties: false,
  } as const;
}
