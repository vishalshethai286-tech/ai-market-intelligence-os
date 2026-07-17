import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { WebsiteAnalysis } from "@/models";
import { EXTRACTION_MAX_TOKENS, EXTRACTION_MODEL } from "./constants";
import { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import { EXTRACTION_JSON_SCHEMA, type ExtractedCompanyProfile } from "./schema";

export class ExtractionError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Calls Claude to extract a structured company profile from a completed
 * WebsiteAnalysis row. Throws ExtractionError on refusal, truncation, or a
 * malformed response — callers decide how to surface that (this module has
 * no DB or workspace awareness).
 */
export async function extractCompanyProfile(
  analysis: WebsiteAnalysis,
): Promise<ExtractedCompanyProfile> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA },
    },
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildExtractionPrompt(analysis) }],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("Claude declined to extract a profile for this content.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError("Extraction response was not valid JSON.");
  }

  return {
    companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
    businessDescription: typeof parsed.businessDescription === "string" ? parsed.businessDescription : "",
    industry: typeof parsed.industry === "string" ? parsed.industry : "",
    businessModel: typeof parsed.businessModel === "string" ? parsed.businessModel : "",
    countriesServed: Array.isArray(parsed.countriesServed) ? parsed.countriesServed.filter((v) => typeof v === "string") : [],
    headquarters: typeof parsed.headquarters === "string" ? parsed.headquarters : "",
    operationType:
      typeof parsed.operationType === "string" &&
      ["MANUFACTURER", "TRADER", "SERVICE_PROVIDER", "OTHER", "UNKNOWN"].includes(parsed.operationType)
        ? (parsed.operationType as ExtractedCompanyProfile["operationType"])
        : "UNKNOWN",
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications.filter((v) => typeof v === "string") : [],
    keyProductsServices: Array.isArray(parsed.keyProductsServices)
      ? parsed.keyProductsServices.filter((v) => typeof v === "string")
      : [],
    confidenceScore: clampConfidence(parsed.confidenceScore),
  };
}
