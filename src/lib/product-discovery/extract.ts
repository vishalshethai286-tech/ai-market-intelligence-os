import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DISCOVERY_MAX_TOKENS, DISCOVERY_MODEL, MAX_PRODUCTS_PER_RUN } from "./constants";
import { buildDiscoveryPrompt, DISCOVERY_SYSTEM_PROMPT } from "./prompt";
import { buildDiscoveryJsonSchema, type ExtractedProductService } from "./schema";
import type { FetchedPage } from "./fetch-pages";

export class DiscoveryError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Calls Claude to identify distinct products/services across a set of
 * already-fetched pages. `sourceUrls` on each returned item is constrained
 * (both by the request schema and defensively again here) to the URLs in
 * `pages` — the model can only cite a page it was actually given.
 */
export async function extractProductServices(pages: FetchedPage[]): Promise<ExtractedProductService[]> {
  if (pages.length === 0) {
    throw new DiscoveryError("No page content available to extract products or services from.");
  }

  const sourceUrlChoices = pages.map((page) => page.url);

  const response = await client.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: DISCOVERY_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: buildDiscoveryJsonSchema(sourceUrlChoices) },
    },
    system: DISCOVERY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildDiscoveryPrompt(pages) }],
  });

  if (response.stop_reason === "refusal") {
    throw new DiscoveryError("Claude declined to extract products or services for this content.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new DiscoveryError("Discovery response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new DiscoveryError("Discovery response did not include a text block.");
  }

  let parsed: { products?: unknown[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new DiscoveryError("Discovery response was not valid JSON.");
  }

  const products = Array.isArray(parsed.products) ? parsed.products : [];

  return products.slice(0, MAX_PRODUCTS_PER_RUN).map((raw): ExtractedProductService => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";

    return {
      name: name || "Untitled product/service",
      category: typeof item.category === "string" ? item.category : "",
      subcategory: typeof item.subcategory === "string" ? item.subcategory : "",
      description: typeof item.description === "string" ? item.description : "",
      applications: toStringArray(item.applications),
      targetIndustries: toStringArray(item.targetIndustries),
      buyerTypes: toStringArray(item.buyerTypes),
      keywords: toStringArray(item.keywords),
      sourceUrls: toStringArray(item.sourceUrls).filter((url) => sourceUrlChoices.includes(url)),
      confidenceScore: clampConfidence(item.confidenceScore),
    };
  });
}
