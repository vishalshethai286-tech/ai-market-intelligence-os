import "server-only";
import type { RawSearchResult } from "@/models";

export type VendorRegistrationExtractionContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  productChoices: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
};

export const VENDOR_REGISTRATION_EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst evaluating one raw web search
result to decide whether it represents a real vendor/supplier registration opportunity — a supplier portal, vendor
registration form, procurement portal, prequalification process, or approved-vendor onboarding page — relevant to OUR
company, given OUR company profile. Exclude directory listings, generic news articles, blog posts, and our own
company's website. Only extract details you can actually infer from the title, snippet, or URL given — never guess or
invent a value that isn't supported by the result; use an empty string (or empty array) for anything you can't infer.`;

export function buildVendorRegistrationExtractionPrompt(result: RawSearchResult, context: VendorRegistrationExtractionContext): string {
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

/** JSON Schema for output_config.format — matches VendorRegistrationCandidateSchema in schema.ts. `matchedProductServiceName` is constrained to what we actually offer so the model can't invent a product. */
export function buildVendorRegistrationExtractionJsonSchema(productChoices: string[]) {
  return {
    type: "object",
    properties: {
      isRelevant: {
        type: "boolean",
        description: "True only if this result plausibly represents a real vendor/supplier registration opportunity relevant to our products/services — not a directory, generic news article, blog post, or our own site.",
      },
      customerName: { type: "string", description: "The buyer/procurement body's name, if inferable. Empty string if not." },
      country: { type: "string", description: "The country this buyer is in, if inferable. Empty string if not — never guess." },
      address: { type: "string", description: "A public postal/street address, only if explicitly present. Empty string otherwise." },
      phoneNumber: { type: "string", description: "A public phone number, only if explicitly present. Empty string otherwise." },
      website: { type: "string", description: "The buyer's own website, if inferable. Empty string if not." },
      vendorRegistrationLink: { type: "string", description: "The vendor/supplier registration form or portal URL, if inferable — often the result's own URL. Empty string if not." },
      registrationType: {
        type: "string",
        description: "What kind of registration this is, e.g. Supplier Portal, Vendor Registration Form, Procurement Portal, Prequalification, Approved Vendor Onboarding. Empty string if unclear.",
      },
      requiredDocuments: {
        type: "array",
        items: { type: "string" },
        description: "Documents mentioned as required for registration, if visible (e.g. company profile, ISO certificate, trade license). Empty array if none inferable.",
      },
      matchedProductServiceName: {
        type: "string",
        enum: [...productChoices, ""],
        description: "Which of our given products/services this registration seems relevant to. Empty string if unclear.",
      },
      aiVendorRegistrationExplanation: { type: "string", description: "One or two sentences on why this is (or isn't) a relevant vendor registration opportunity." },
      confidenceScore: { type: "number", description: "0 to 1: your confidence that the fields above are correct." },
    },
    required: [
      "isRelevant",
      "customerName",
      "country",
      "address",
      "phoneNumber",
      "website",
      "vendorRegistrationLink",
      "registrationType",
      "requiredDocuments",
      "matchedProductServiceName",
      "aiVendorRegistrationExplanation",
      "confidenceScore",
    ],
    additionalProperties: false,
  } as const;
}
