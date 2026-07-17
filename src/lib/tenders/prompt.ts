import "server-only";
import type { RawSearchResult } from "@/models";

export type TenderExtractionContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  productChoices: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
};

export const TENDER_EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst evaluating one raw web search
result to decide whether it represents a tender buyer (a procurement body, government department, or portal that
publishes tenders), a live tender opportunity (a specific, currently-open bid/RFQ/RFP), both, or neither — relevant to
OUR company, given OUR company profile. Exclude directory listings, generic news articles, blog posts, and our own
company's website. Only extract details you can actually infer from the title, snippet, or URL given — never guess
or invent a value that isn't supported by the result; use an empty string (or empty array) for anything you can't
infer. Dates must be returned as ISO 8601 (YYYY-MM-DD) strings, or an empty string if no date is visible.`;

export function buildTenderExtractionPrompt(result: RawSearchResult, context: TenderExtractionContext): string {
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

/** JSON Schema for output_config.format — matches TenderCandidateSchema in schema.ts. `matchedProductServiceName` is constrained to what we actually offer so the model can't invent a product. */
export function buildTenderExtractionJsonSchema(productChoices: string[]) {
  return {
    type: "object",
    properties: {
      isRelevant: {
        type: "boolean",
        description: "True only if this result plausibly represents a tender buyer or a live tender opportunity relevant to our products/services — not a directory, generic news article, blog post, or our own site.",
      },
      extractionType: {
        type: "string",
        enum: ["TENDER_BUYER", "TENDER_OPPORTUNITY", "BOTH", "NONE"],
        description: "Whether this result describes a tender buyer/procurement body (TENDER_BUYER), a specific live tender (TENDER_OPPORTUNITY), both, or neither (NONE, if not relevant).",
      },
      customerName: { type: "string", description: "The buyer/procurement body's name, if inferable. Empty string if not." },
      country: { type: "string", description: "The country this buyer/tender is in, if inferable. Empty string if not — never guess." },
      address: { type: "string", description: "A public postal/street address, only if explicitly present. Empty string otherwise." },
      phoneNumber: { type: "string", description: "A public phone number, only if explicitly present. Empty string otherwise." },
      website: { type: "string", description: "The buyer's own website, if inferable. Empty string if not." },
      tenderWebsiteLink: { type: "string", description: "The buyer's tender/procurement portal URL, if inferable — often the result's own URL. Empty string if not." },
      buyerOrganization: { type: "string", description: "The organization issuing this specific tender, if inferable (may be the same as customerName). Empty string if not." },
      tenderTitle: { type: "string", description: "The tender's title, if inferable. Empty string if not." },
      tenderDescription: { type: "string", description: "A short description of what's being procured, if visible. Empty string otherwise." },
      startDate: { type: "string", description: "The tender's start/publish date as YYYY-MM-DD, if explicitly visible. Empty string otherwise — never guess." },
      endDate: { type: "string", description: "The tender's closing/deadline date as YYYY-MM-DD, if explicitly visible. Empty string otherwise — never guess." },
      tenderLink: { type: "string", description: "The best URL for this specific tender's details — usually the result's own URL. Empty string if none." },
      productsServicesRequired: {
        type: "array",
        items: { type: "string" },
        description: "Products/services this tender is requesting, as mentioned in the title/snippet. Empty array if none inferable.",
      },
      matchedProductServiceName: {
        type: "string",
        enum: [...productChoices, ""],
        description: "Which of our given products/services this tender seems to need. Empty string if unclear.",
      },
      aiTenderExplanation: { type: "string", description: "One or two sentences on why this is (or isn't) a relevant tender buyer/opportunity." },
      confidenceScore: { type: "number", description: "0 to 1: your confidence that the fields above are correct." },
    },
    required: [
      "isRelevant",
      "extractionType",
      "customerName",
      "country",
      "address",
      "phoneNumber",
      "website",
      "tenderWebsiteLink",
      "buyerOrganization",
      "tenderTitle",
      "tenderDescription",
      "startDate",
      "endDate",
      "tenderLink",
      "productsServicesRequired",
      "matchedProductServiceName",
      "aiTenderExplanation",
      "confidenceScore",
    ],
    additionalProperties: false,
  } as const;
}
