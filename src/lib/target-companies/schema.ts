/** Shape of a single result's assessment, validated against buildExtractionJsonSchema(). */
export type ExtractedTargetCompany = {
  isRelevantTarget: boolean;
  companyName: string;
  website: string;
  industry: string;
  country: string;
  matchedProduct: string;
  relevanceExplanation: string;
  confidenceScore: number;
};

/**
 * Builds the `output_config.format` JSON Schema for a target-company
 * extraction run: an array with exactly one assessment per input search
 * result, in the same order, so the caller can zip each assessment back onto
 * its source result by index. `matchedProduct` is constrained to the given
 * product/service names (plus an empty string) so the model can't invent a
 * product we don't actually offer.
 */
export function buildExtractionJsonSchema(resultCount: number, productChoices: string[]) {
  return {
    type: "object",
    properties: {
      assessments: {
        type: "array",
        minItems: resultCount,
        maxItems: resultCount,
        items: {
          type: "object",
          properties: {
            isRelevantTarget: {
              type: "boolean",
              description:
                "True only if this result plausibly represents a real, distinct company that could be a customer/lead for us — not a directory listing, news article, blog post, marketplace, social media profile, or our own site.",
            },
            companyName: {
              type: "string",
              description: "The company's name, if inferable from the title/snippet/domain. Empty string if not.",
            },
            website: {
              type: "string",
              description: "The company's own website URL, if inferable (often just the result's URL/domain). Empty string if not.",
            },
            industry: {
              type: "string",
              description: "The company's industry, if inferable. Empty string if not — never guess.",
            },
            country: {
              type: "string",
              description: "The country this company appears to be based in, if inferable. Empty string if not — never guess.",
            },
            matchedProduct: {
              type: "string",
              enum: [...productChoices, ""],
              description: "Which of our given products/services this company seems to be a fit for. Empty string if unclear or not relevant.",
            },
            relevanceExplanation: {
              type: "string",
              description: "One or two sentences on why this is (or isn't) a relevant target, referencing specifics from the result.",
            },
            confidenceScore: {
              type: "number",
              description: "0 to 1: your confidence that isRelevantTarget and the extracted fields above are correct.",
            },
          },
          required: [
            "isRelevantTarget",
            "companyName",
            "website",
            "industry",
            "country",
            "matchedProduct",
            "relevanceExplanation",
            "confidenceScore",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["assessments"],
    additionalProperties: false,
  } as const;
}
