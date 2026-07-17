import "server-only";
import type { WebsiteAnalysis } from "@/models";
import { MAX_LINKS_PER_CATEGORY_FOR_PROMPT, MAX_VISIBLE_TEXT_FOR_PROMPT } from "./constants";

export const EXTRACTION_SYSTEM_PROMPT = `You are a market intelligence analyst. You are given structured content
extracted from a single company's homepage — its title, meta description, headings, visible text, and internal
links grouped by likely page type — and asked to build a company profile from it.

Only use what's in the provided content. Do not invent facts, and do not rely on outside knowledge of the company
beyond what's given. If something isn't determinable from the content, say so via the schema's empty-string /
empty-array convention rather than guessing.`;

type Headings = { h1: string[]; h2: string[]; h3: string[] };
type IdentifiedLink = { href: string; text: string };
type IdentifiedPages = Record<string, IdentifiedLink[]>;

export function buildExtractionPrompt(analysis: WebsiteAnalysis): string {
  const headings = (analysis.headings as Headings | null) ?? { h1: [], h2: [], h3: [] };
  const identifiedPages = (analysis.identifiedPages as IdentifiedPages | null) ?? {};

  const linkSections = Object.entries(identifiedPages)
    .filter(([, links]) => links.length > 0)
    .map(([category, links]) => {
      const sample = links
        .slice(0, MAX_LINKS_PER_CATEGORY_FOR_PROMPT)
        .map((link) => `  - ${link.text || "(no link text)"} -> ${link.href}`)
        .join("\n");
      return `${category}:\n${sample}`;
    })
    .join("\n\n");

  return `Homepage URL: ${analysis.url}

Title: ${analysis.title ?? "(none)"}
Meta description: ${analysis.metaDescription ?? "(none)"}

Headings:
H1: ${headings.h1.join(" | ") || "(none)"}
H2: ${headings.h2.join(" | ") || "(none)"}
H3: ${headings.h3.join(" | ") || "(none)"}

Visible page text (truncated):
${(analysis.visibleText ?? "").slice(0, MAX_VISIBLE_TEXT_FOR_PROMPT) || "(none)"}

Internal links by likely page type (link text -> URL; these are signals about site structure, their target pages were not fetched):
${linkSections || "(none identified)"}

Build the company profile from this content.`;
}
