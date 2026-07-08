import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SearchResult } from "@/lib/search";
import { EXTRACTION_MAX_TOKENS, EXTRACTION_MODEL } from "./constants";
import { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT, type TargetExtractionContext } from "./prompt";
import { buildExtractionJsonSchema, type ExtractedTargetCompany } from "./schema";

export class TargetExtractionError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Calls Claude to assess a batch of search results against our own company
 * profile, deciding per-result whether it's a real target company, extracting
 * what it can, and scoring its confidence. Throws TargetExtractionError on
 * refusal, truncation, or a malformed response — like `generateSearchQueries`,
 * this is the feature's main deliverable, not best-effort enrichment, so a
 * failure should surface rather than silently return nothing.
 */
export async function extractTargetCompanies(
  results: SearchResult[],
  context: TargetExtractionContext,
  productChoices: string[],
): Promise<ExtractedTargetCompany[]> {
  if (results.length === 0) return [];

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildExtractionJsonSchema(results.length, productChoices) },
    },
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildExtractionPrompt(results, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new TargetExtractionError("Claude declined to assess these search results.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new TargetExtractionError("Target company extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new TargetExtractionError("Target company extraction response did not include a text block.");
  }

  let parsed: { assessments?: unknown[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new TargetExtractionError("Target company extraction response was not valid JSON.");
  }

  const assessments = Array.isArray(parsed.assessments) ? parsed.assessments : [];

  return assessments.map((raw): ExtractedTargetCompany => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      isRelevantTarget: item.isRelevantTarget === true,
      companyName: typeof item.companyName === "string" ? item.companyName.trim() : "",
      website: typeof item.website === "string" ? item.website.trim() : "",
      industry: typeof item.industry === "string" ? item.industry.trim() : "",
      country: typeof item.country === "string" ? item.country.trim() : "",
      matchedProduct: typeof item.matchedProduct === "string" ? item.matchedProduct.trim() : "",
      relevanceExplanation: typeof item.relevanceExplanation === "string" ? item.relevanceExplanation.trim() : "",
      confidenceScore: clampConfidence(item.confidenceScore),
    };
  });
}
