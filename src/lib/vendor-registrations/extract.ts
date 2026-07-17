import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawSearchResult } from "@/models";
import { EXTRACTION_MODEL, EXTRACTION_MAX_TOKENS } from "@/lib/company-profile/constants";
import {
  buildVendorRegistrationExtractionPrompt,
  buildVendorRegistrationExtractionJsonSchema,
  VENDOR_REGISTRATION_EXTRACTION_SYSTEM_PROMPT,
} from "./prompt";
import type { VendorRegistrationExtractionContext } from "./prompt";
import type { VendorRegistrationCandidate } from "./schema";

export class VendorRegistrationExtractionError extends Error {}

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

/**
 * Calls Claude to assess a single RawSearchResult for whether it represents
 * a real vendor/supplier registration opportunity. Throws
 * VendorRegistrationExtractionError on refusal, truncation, or a malformed
 * response — the processor (processor.ts) catches this per-result so one
 * bad extraction doesn't abort the whole batch.
 */
export async function extractVendorRegistrationCandidate(
  result: RawSearchResult,
  context: VendorRegistrationExtractionContext,
): Promise<VendorRegistrationCandidate> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildVendorRegistrationExtractionJsonSchema(context.productChoices) },
    },
    system: VENDOR_REGISTRATION_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildVendorRegistrationExtractionPrompt(result, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new VendorRegistrationExtractionError("Claude declined to assess this search result.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new VendorRegistrationExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new VendorRegistrationExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new VendorRegistrationExtractionError("Extraction response was not valid JSON.");
  }

  return {
    isRelevant: Boolean(parsed.isRelevant),
    customerName: str(parsed.customerName),
    country: str(parsed.country),
    address: str(parsed.address),
    phoneNumber: str(parsed.phoneNumber),
    website: str(parsed.website),
    vendorRegistrationLink: str(parsed.vendorRegistrationLink),
    registrationType: str(parsed.registrationType),
    requiredDocuments: strArray(parsed.requiredDocuments),
    matchedProductServiceName: str(parsed.matchedProductServiceName),
    aiVendorRegistrationExplanation: str(parsed.aiVendorRegistrationExplanation),
    confidenceScore: clampConfidence(parsed.confidenceScore),
  };
}
