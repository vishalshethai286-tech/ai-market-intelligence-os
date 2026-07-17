import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawSearchResult } from "@/models";
import { EXTRACTION_MODEL, EXTRACTION_MAX_TOKENS } from "@/lib/company-profile/constants";
import { buildTenderExtractionPrompt, buildTenderExtractionJsonSchema, TENDER_EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import type { TenderExtractionContext } from "./prompt";
import { TENDER_EXTRACTION_TYPES, type TenderCandidate } from "./schema";

export class TenderExtractionError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function extractionType(value: unknown): TenderCandidate["extractionType"] {
  return typeof value === "string" && (TENDER_EXTRACTION_TYPES as readonly string[]).includes(value)
    ? (value as TenderCandidate["extractionType"])
    : "NONE";
}

/**
 * Calls Claude to assess a single RawSearchResult for whether it represents
 * a tender buyer, a live tender opportunity, both, or neither. Throws
 * TenderExtractionError on refusal, truncation, or a malformed response —
 * the processor (processor.ts) catches this per-result so one bad
 * extraction doesn't abort the whole batch.
 */
export async function extractTenderCandidate(
  result: RawSearchResult,
  context: TenderExtractionContext,
): Promise<TenderCandidate> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildTenderExtractionJsonSchema(context.productChoices) },
    },
    system: TENDER_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildTenderExtractionPrompt(result, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new TenderExtractionError("Claude declined to assess this search result.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new TenderExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new TenderExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new TenderExtractionError("Extraction response was not valid JSON.");
  }

  return {
    isRelevant: Boolean(parsed.isRelevant),
    extractionType: extractionType(parsed.extractionType),
    customerName: str(parsed.customerName),
    country: str(parsed.country),
    address: str(parsed.address),
    phoneNumber: str(parsed.phoneNumber),
    website: str(parsed.website),
    tenderWebsiteLink: str(parsed.tenderWebsiteLink),
    buyerOrganization: str(parsed.buyerOrganization),
    tenderTitle: str(parsed.tenderTitle),
    tenderDescription: str(parsed.tenderDescription),
    startDate: str(parsed.startDate),
    endDate: str(parsed.endDate),
    tenderLink: str(parsed.tenderLink),
    productsServicesRequired: strArray(parsed.productsServicesRequired),
    matchedProductServiceName: str(parsed.matchedProductServiceName),
    aiTenderExplanation: str(parsed.aiTenderExplanation),
    confidenceScore: clampConfidence(parsed.confidenceScore),
  };
}
