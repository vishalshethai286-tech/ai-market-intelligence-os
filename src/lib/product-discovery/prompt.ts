import "server-only";
import { MAX_PRODUCTS_PER_RUN } from "./constants";
import type { FetchedPage } from "./fetch-pages";

export const DISCOVERY_SYSTEM_PROMPT = `You are a market intelligence analyst. You are given the content of one or
more pages from a single company's website and asked to identify every distinct product or service the company
offers.

Only use what's in the provided content. Do not invent products or services that aren't actually mentioned, and do
not rely on outside knowledge of the company. If the same product or service appears on more than one page, merge it
into a single record rather than listing it twice, and cite every page it appears on.`;

export function buildDiscoveryPrompt(pages: FetchedPage[]): string {
  const sections = pages
    .map(
      (page, index) =>
        `Page ${index + 1}: ${page.url}\nTitle: ${page.title ?? "(none)"}\nContent:\n${page.text || "(no text extracted)"}`,
    )
    .join("\n\n---\n\n");

  return `Below is content from ${pages.length} page${pages.length === 1 ? "" : "s"} of a company's website.

${sections}

Identify every distinct product or service mentioned across these pages. Return at most ${MAX_PRODUCTS_PER_RUN} of
the clearest, most distinct items, ordered from most to least prominent on the site.`;
}
