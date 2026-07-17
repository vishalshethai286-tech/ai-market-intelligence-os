import "server-only";
import type { RawSearchResult } from "@/models";
import { CONTACT_ROLE_CATEGORIES, CONTACT_SENIORITIES, CONTACT_SOURCE_TYPES } from "@/models";

export type ContactExtractionContext = {
  /** The company this search was targeting, if the raw result came from a ContactDiscoveryTarget-driven query — grounds the extraction instead of relying on the model to infer it. */
  companyName: string;
  companyWebsite: string;
  country: string;
};

export const PUBLIC_CONTACT_EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst identifying PUBLICLY VISIBLE business
contacts from one raw web search result — procurement, purchase, sourcing, supply chain, vendor management, project,
engineering, contracts, tendering, operations, and management contacts relevant to reaching a company's buying/sourcing
side. Extract only what a search engine can already see on a public page (company website, contact/team/management
page, procurement or supplier-portal page, tender document, public PDF, public directory, press release, conference
speaker page, industry association page).

Strict rules:
- Never invent a name, email, phone number, or LinkedIn URL. If a field isn't visible in the title/snippet/URL, leave
  it as an empty string.
- Never guess or construct a personal email address from a name pattern (e.g. never produce "jane.doe@company.com"
  unless that exact address is visible in the result).
- Never extract from a source that requires login or appears to be a private/restricted page.
- Do not scrape or reference LinkedIn profile content — only store a LinkedIn URL if it is already plainly present in
  the public title/snippet/URL text given to you.
- If only a department/team is visible (no named person), still create one contact record for it — e.g. fullName
  "Supplier Registration Team" or "Procurement Department" — with roleCategory set appropriately and seniority
  UNKNOWN.
- A single result can describe more than one contact (e.g. a management-team page listing several people, or a page
  naming both a person and a separate department contact) — return one entry per distinct contact you can identify.
- Mark uncertain extractions with a lower confidenceScore (0-1) rather than omitting them outright.
- If nothing on this page is a plausible business contact, return isRelevant=false and an empty contacts array.`;

export function buildPublicContactExtractionPrompt(result: RawSearchResult, context: ContactExtractionContext): string {
  const contextLines = [
    `Target company (if known): ${context.companyName || "(unknown — infer from the result itself if possible)"}`,
    `Target company website (if known): ${context.companyWebsite || "(unknown)"}`,
    `Country (if known): ${context.country || "(unknown)"}`,
  ].join("\n");

  return `${contextLines}\n\nSearch result to evaluate:\nTitle: ${result.title}\nSnippet: ${result.snippet ?? ""}\nURL: ${result.url}\nDomain: ${result.domain ?? ""}\n\nIdentify every publicly-visible business contact in this result.`;
}

/** JSON Schema for output_config.format — matches PublicContactExtractionSchema in schema.ts. */
export function buildPublicContactExtractionJsonSchema() {
  return {
    type: "object",
    properties: {
      isRelevant: {
        type: "boolean",
        description: "True only if this result contains at least one plausible public business contact (named person or department/team contact) relevant to procurement/sourcing/vendor management/projects/engineering/contracts/tendering/operations/management.",
      },
      contacts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fullName: { type: "string", description: "The person's full name, or a department/team label (e.g. 'Supplier Registration Team') if no named person is visible. Empty string if truly nothing identifiable." },
            companyName: { type: "string", description: "The company this contact belongs to, if inferable. Empty string if not." },
            companyWebsite: { type: "string", description: "The company's own website, if inferable. Empty string if not." },
            designation: { type: "string", description: "Job title or role description, only if explicitly visible. Empty string otherwise." },
            department: { type: "string", description: "Department/team name, only if explicitly visible. Empty string otherwise." },
            roleCategory: { type: "string", enum: [...CONTACT_ROLE_CATEGORIES], description: "Best-fit role category for this contact." },
            seniority: { type: "string", enum: [...CONTACT_SENIORITIES], description: "Best-fit seniority level for this contact. UNKNOWN if not inferable." },
            email: { type: "string", description: "A public email address, ONLY if explicitly visible in the result. Never invent or guess one. Empty string otherwise." },
            phoneNumber: { type: "string", description: "A public phone number, only if explicitly visible. Empty string otherwise." },
            mobileNumber: { type: "string", description: "A public mobile number, only if explicitly visible. Empty string otherwise." },
            linkedinUrl: { type: "string", description: "A LinkedIn profile URL, ONLY if it is already plainly present in the public title/snippet/URL text. Never look it up or guess it. Empty string otherwise." },
            country: { type: "string", description: "The country this contact is based in, if inferable. Empty string if not — never guess." },
            location: { type: "string", description: "City/region, only if explicitly visible. Empty string otherwise." },
            sourceUrl: { type: "string", description: "The result's own URL — the evidence for this contact." },
            sourceType: { type: "string", enum: [...CONTACT_SOURCE_TYPES], description: "What kind of public page this contact was found on." },
            confidenceScore: { type: "number", description: "0 to 1: your confidence that this is a real, currently-accurate public contact." },
            aiContactExplanation: { type: "string", description: "One sentence on why this is a relevant public contact and what evidence supports it." },
          },
          required: [
            "fullName",
            "companyName",
            "companyWebsite",
            "designation",
            "department",
            "roleCategory",
            "seniority",
            "email",
            "phoneNumber",
            "mobileNumber",
            "linkedinUrl",
            "country",
            "location",
            "sourceUrl",
            "sourceType",
            "confidenceScore",
            "aiContactExplanation",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["isRelevant", "contacts"],
    additionalProperties: false,
  } as const;
}
