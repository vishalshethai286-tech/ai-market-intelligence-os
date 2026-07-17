import "server-only";
import type { RawSearchResult } from "@/models";

export type ProjectExtractionContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  productChoices: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  countriesServed: string[];
};

export const PROJECT_EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst evaluating one raw web search
result to decide whether it represents a genuine, publicly-announced project opportunity relevant to OUR company,
given OUR company profile. A project opportunity is a real, named project (a plant, expansion, construction,
tender-bound infrastructure, etc.) that could need our products/services — not a directory listing, generic news
article about an industry in general, blog post, or our own company's website. Only extract details (client name,
project name, location, contractor, timeline, link) you can actually infer from the title, snippet, or URL given —
never guess or invent a value that isn't supported by the result; use an empty string for anything you can't infer.`;

export function buildProjectExtractionPrompt(result: RawSearchResult, context: ProjectExtractionContext): string {
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

/** JSON Schema for output_config.format — matches ProjectCandidateSchema in schema.ts. `matchedProductServiceName` is constrained to what we actually offer so the model can't invent a product. */
export function buildProjectExtractionJsonSchema(productChoices: string[]) {
  return {
    type: "object",
    properties: {
      isRelevant: {
        type: "boolean",
        description: "True only if this result plausibly represents a real, named project opportunity relevant to our products/services — not a directory, generic industry news article, blog post, or our own site.",
      },
      clientName: { type: "string", description: "The project owner/client company, if inferable. Empty string if not." },
      projectName: { type: "string", description: "The project's name, if inferable. Empty string if not." },
      location: { type: "string", description: "City/region the project is located in, if inferable. Empty string if not." },
      country: { type: "string", description: "The country this project is in, if inferable. Empty string if not — never guess." },
      contractorName: { type: "string", description: "The contractor/EPC/developer, only if explicitly named. Empty string otherwise." },
      timeline: { type: "string", description: "Any timeline detail explicitly present (e.g. a start/completion date or duration). Empty string otherwise." },
      projectInformationLink: { type: "string", description: "The best URL for more information on this project — usually the result's own URL. Empty string if none." },
      industry: { type: "string", description: "The project's industry, if inferable. Empty string if not." },
      matchedProductServiceName: {
        type: "string",
        enum: [...productChoices, ""],
        description: "Which of our given products/services this project seems to need. Empty string if unclear.",
      },
      projectStage: {
        type: "string",
        enum: ["ANNOUNCED", "PLANNING", "FEED", "TENDER", "AWARDED", "CONSTRUCTION", "OPERATIONAL", "UNKNOWN"],
        description: "The project's current stage, if inferable. UNKNOWN if not.",
      },
      aiOpportunityExplanation: { type: "string", description: "One or two sentences on why this is (or isn't) a relevant project opportunity." },
      confidenceScore: { type: "number", description: "0 to 1: your confidence that the fields above are correct." },
    },
    required: [
      "isRelevant",
      "clientName",
      "projectName",
      "location",
      "country",
      "contractorName",
      "timeline",
      "projectInformationLink",
      "industry",
      "matchedProductServiceName",
      "projectStage",
      "aiOpportunityExplanation",
      "confidenceScore",
    ],
    additionalProperties: false,
  } as const;
}
