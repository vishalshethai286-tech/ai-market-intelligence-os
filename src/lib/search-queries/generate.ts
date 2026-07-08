import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { QUERY_GENERATOR_MAX_TOKENS, QUERY_GENERATOR_MODEL, QUERY_CATEGORIES } from "./constants";
import { buildQueryGeneratorPrompt, QUERY_GENERATOR_SYSTEM_PROMPT, type QueryGeneratorContext } from "./prompt";
import { buildQueryGeneratorJsonSchema, type GeneratedQueriesByCategory } from "./schema";

export class QueryGenerationError extends Error {}

const client = new Anthropic();

/**
 * Calls Claude to generate candidate search queries across all 7 categories
 * in `QUERY_CATEGORIES`, grounded in the given Business Brain context. Throws
 * QueryGenerationError on refusal, truncation, or a malformed response —
 * unlike `identifyCompetitors` (best-effort enrichment that fails open),
 * query generation is this feature's main deliverable, so a failure should
 * surface to the caller rather than silently return nothing.
 */
export async function generateSearchQueries(context: QueryGeneratorContext): Promise<GeneratedQueriesByCategory> {
  const response = await client.messages.create({
    model: QUERY_GENERATOR_MODEL,
    max_tokens: QUERY_GENERATOR_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildQueryGeneratorJsonSchema() },
    },
    system: QUERY_GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildQueryGeneratorPrompt(context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new QueryGenerationError("Claude declined to generate search queries for this content.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new QueryGenerationError("Query generation response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new QueryGenerationError("Query generation response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new QueryGenerationError("Query generation response was not valid JSON.");
  }

  const result: GeneratedQueriesByCategory = {};
  for (const { key } of QUERY_CATEGORIES) {
    const rawItems = Array.isArray(parsed[key]) ? parsed[key] : [];
    result[key] = rawItems
      .map((raw): { query: string; basedOn: string } | null => {
        const item = (raw ?? {}) as Record<string, unknown>;
        const query = typeof item.query === "string" ? item.query.trim() : "";
        if (!query) return null;
        return { query, basedOn: typeof item.basedOn === "string" ? item.basedOn.trim() : "" };
      })
      .filter((item): item is { query: string; basedOn: string } => item !== null);
  }

  return result;
}
