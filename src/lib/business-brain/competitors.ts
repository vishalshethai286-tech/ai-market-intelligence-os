import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { COMPETITOR_MAX_TOKENS, COMPETITOR_MODEL, MAX_COMPETITORS } from "./constants";

export type CompetitorCandidate = {
  name: string;
  reason: string;
  confidenceScore: number;
};

export type CompetitorContext = {
  companyName: string;
  industry: string;
  businessDescription: string;
  keyProductsServices: string[];
  countriesServed: string[];
};

const client = new Anthropic();

const COMPETITOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The competing company's name." },
          reason: { type: "string", description: "One sentence on why this is a plausible competitor." },
          confidenceScore: {
            type: "number",
            description: "0 to 1 confidence this is a real, relevant competitor of the given company.",
          },
        },
        required: ["name", "reason", "confidenceScore"],
        additionalProperties: false,
      },
    },
  },
  required: ["competitors"],
  additionalProperties: false,
} as const;

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Identifies competitors Claude has genuine knowledge of, given the
 * company's own profile. Returns an empty array (never throws) when nothing
 * is confidently known, on a refusal, or on any API error — this is
 * "competitors if known", best-effort enrichment, not a required step.
 */
export async function identifyCompetitors(context: CompetitorContext): Promise<CompetitorCandidate[]> {
  try {
    const response = await client.messages.create({
      model: COMPETITOR_MODEL,
      max_tokens: COMPETITOR_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: COMPETITOR_JSON_SCHEMA },
      },
      system: `You are a market intelligence analyst. Given a company's profile, name real, well-known
competitors you have genuine knowledge of. Only include a company if you can identify it with
reasonable confidence — return an empty list rather than inventing or guessing a plausible-sounding
name. Never include the company itself.`,
      messages: [
        {
          role: "user",
          content: `Company: ${context.companyName}
Industry: ${context.industry || "(unknown)"}
Description: ${context.businessDescription || "(none)"}
Key products/services: ${context.keyProductsServices.join(", ") || "(none)"}
Countries served: ${context.countriesServed.join(", ") || "(unknown)"}

Name up to ${MAX_COMPETITORS} real competitors, if you genuinely know of any.`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return [];
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    const parsed = JSON.parse(textBlock.text) as { competitors?: unknown[] };
    const competitors = Array.isArray(parsed.competitors) ? parsed.competitors : [];

    return competitors
      .slice(0, MAX_COMPETITORS)
      .map((raw): CompetitorCandidate => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return {
          name: typeof item.name === "string" ? item.name.trim() : "",
          reason: typeof item.reason === "string" ? item.reason : "",
          confidenceScore: clampConfidence(item.confidenceScore),
        };
      })
      .filter((candidate) => candidate.name.length > 0);
  } catch {
    return [];
  }
}
