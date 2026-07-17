import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RawSearchResult } from "@/models";
import { CONTACT_ROLE_CATEGORIES, CONTACT_SENIORITIES, CONTACT_SOURCE_TYPES } from "@/models";
import type { ContactRoleCategory, ContactSeniority, ContactSourceType } from "@/models";
import { EXTRACTION_MODEL, EXTRACTION_MAX_TOKENS } from "@/lib/company-profile/constants";
import { buildPublicContactExtractionPrompt, buildPublicContactExtractionJsonSchema, PUBLIC_CONTACT_EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import type { ContactExtractionContext } from "./prompt";
import type { PublicContactExtraction, ContactCandidate } from "./schema";

export class PublicContactExtractionError extends Error {}

const client = new Anthropic();

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, num));
}

function roleCategory(value: unknown): ContactRoleCategory {
  return typeof value === "string" && (CONTACT_ROLE_CATEGORIES as readonly string[]).includes(value) ? (value as ContactRoleCategory) : "OTHER";
}

function seniority(value: unknown): ContactSeniority {
  return typeof value === "string" && (CONTACT_SENIORITIES as readonly string[]).includes(value) ? (value as ContactSeniority) : "UNKNOWN";
}

function sourceType(value: unknown): ContactSourceType {
  return typeof value === "string" && (CONTACT_SOURCE_TYPES as readonly string[]).includes(value) ? (value as ContactSourceType) : "OTHER";
}

function toContactCandidate(raw: Record<string, unknown>): ContactCandidate {
  return {
    fullName: str(raw.fullName),
    companyName: str(raw.companyName),
    companyWebsite: str(raw.companyWebsite),
    designation: str(raw.designation),
    department: str(raw.department),
    roleCategory: roleCategory(raw.roleCategory),
    seniority: seniority(raw.seniority),
    email: str(raw.email),
    phoneNumber: str(raw.phoneNumber),
    mobileNumber: str(raw.mobileNumber),
    linkedinUrl: str(raw.linkedinUrl),
    country: str(raw.country),
    location: str(raw.location),
    sourceUrl: str(raw.sourceUrl),
    sourceType: sourceType(raw.sourceType),
    confidenceScore: clampConfidence(raw.confidenceScore),
    aiContactExplanation: str(raw.aiContactExplanation),
  };
}

/**
 * Calls Claude to identify every publicly-visible business contact in a
 * single RawSearchResult. Throws PublicContactExtractionError on refusal,
 * truncation, or a malformed response — the processor
 * (contact-discovery/processor.ts) catches this per-result so one bad
 * extraction doesn't abort the whole batch.
 */
export async function extractPublicContacts(result: RawSearchResult, context: ContactExtractionContext): Promise<PublicContactExtraction> {
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildPublicContactExtractionJsonSchema() },
    },
    system: PUBLIC_CONTACT_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPublicContactExtractionPrompt(result, context) }],
  });

  if (response.stop_reason === "refusal") {
    throw new PublicContactExtractionError("Claude declined to assess this search result.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new PublicContactExtractionError("Extraction response was truncated before completing.");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new PublicContactExtractionError("Extraction response did not include a text block.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new PublicContactExtractionError("Extraction response was not valid JSON.");
  }

  const contacts = Array.isArray(parsed.contacts) ? parsed.contacts.map((c) => toContactCandidate(c as Record<string, unknown>)) : [];

  return { isRelevant: Boolean(parsed.isRelevant), contacts };
}
