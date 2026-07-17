import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawSearchResult } from "@/models";
import { EXTRACTION_MODEL, EXTRACTION_MAX_TOKENS } from "@/lib/company-profile/constants";
import { buildCustomerExtractionPrompt, buildCustomerExtractionJsonSchema, CUSTOMER_EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import type { CustomerExtractionContext } from "./prompt";
import type { CustomerCandidate } from "./schema";

export class CustomerExtractionError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Calls Claude to assess a single RawSearchResult for whether it represents a
 * genuine target customer. Throws CustomerExtractionError on refusal,
 * truncation, or a malformed response — the processor (processor.ts) catches
 * this per-result so one bad extraction doesn't abort the whole batch.
 */
export async function extractCustomerCandidate(
  result: RawSearchResult,
  context: CustomerExtractionContext,
): Promise<CustomerCandidate> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildCustomerExtractionJsonSchema(context.productChoices) },
    },
    system: CUSTOMER_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCustomerExtractionPrompt(result, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new CustomerExtractionError("Claude declined to assess this search result.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new CustomerExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new CustomerExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new CustomerExtractionError("Extraction response was not valid JSON.");
  }

  return {
    isRealCompany: Boolean(parsed.isRealCompany),
    isTargetCustomer: Boolean(parsed.isTargetCustomer),
    customerName: str(parsed.customerName),
    country: str(parsed.country),
    website: str(parsed.website),
    address: str(parsed.address),
    phoneNumber: str(parsed.phoneNumber),
    matchedProductServiceName: str(parsed.matchedProductServiceName),
    matchedIndustry: str(parsed.matchedIndustry),
    buyerType: str(parsed.buyerType),
    aiRelevanceExplanation: str(parsed.aiRelevanceExplanation),
    confidenceScore: clampConfidence(parsed.confidenceScore),
  };
}
