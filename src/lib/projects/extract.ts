import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawSearchResult } from "@/models";
import { EXTRACTION_MODEL, EXTRACTION_MAX_TOKENS } from "@/lib/company-profile/constants";
import { buildProjectExtractionPrompt, buildProjectExtractionJsonSchema, PROJECT_EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import type { ProjectExtractionContext } from "./prompt";
import type { ProjectCandidate } from "./schema";

export class ProjectExtractionError extends Error {}

const client = new Anthropic();

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const PROJECT_STAGES = ["ANNOUNCED", "PLANNING", "FEED", "TENDER", "AWARDED", "CONSTRUCTION", "OPERATIONAL", "UNKNOWN"] as const;

function stage(value: unknown): ProjectCandidate["projectStage"] {
  return typeof value === "string" && (PROJECT_STAGES as readonly string[]).includes(value)
    ? (value as ProjectCandidate["projectStage"])
    : "UNKNOWN";
}

/**
 * Calls Claude to assess a single RawSearchResult for whether it represents
 * a genuine project opportunity. Throws ProjectExtractionError on refusal,
 * truncation, or a malformed response — the processor (processor.ts) catches
 * this per-result so one bad extraction doesn't abort the whole batch.
 */
export async function extractProjectCandidate(
  result: RawSearchResult,
  context: ProjectExtractionContext,
): Promise<ProjectCandidate> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildProjectExtractionJsonSchema(context.productChoices) },
    },
    system: PROJECT_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildProjectExtractionPrompt(result, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new ProjectExtractionError("Claude declined to assess this search result.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ProjectExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ProjectExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ProjectExtractionError("Extraction response was not valid JSON.");
  }

  return {
    isRelevant: Boolean(parsed.isRelevant),
    clientName: str(parsed.clientName),
    projectName: str(parsed.projectName),
    location: str(parsed.location),
    country: str(parsed.country),
    contractorName: str(parsed.contractorName),
    timeline: str(parsed.timeline),
    projectInformationLink: str(parsed.projectInformationLink),
    industry: str(parsed.industry),
    matchedProductServiceName: str(parsed.matchedProductServiceName),
    projectStage: stage(parsed.projectStage),
    aiOpportunityExplanation: str(parsed.aiOpportunityExplanation),
    confidenceScore: clampConfidence(parsed.confidenceScore),
  };
}
