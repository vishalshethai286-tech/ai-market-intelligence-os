import type { ParsedLink } from "./parse";

export const PAGE_CATEGORIES = [
  "product",
  "service",
  "about",
  "industries",
  "catalog",
  "contact",
] as const;

export type PageCategory = (typeof PAGE_CATEGORIES)[number];

const CATEGORY_KEYWORDS: Record<PageCategory, string[]> = {
  product: ["product", "products", "platform", "solutions", "solution"],
  service: ["service", "services", "capabilities", "what-we-do"],
  about: ["about", "about-us", "who-we-are", "our-story", "company", "team", "leadership"],
  industries: ["industries", "industry", "sectors", "sector", "markets", "verticals"],
  catalog: ["catalog", "catalogue", "shop", "store", "pricing", "plans"],
  contact: ["contact", "contact-us", "get-in-touch", "support", "enquiry", "inquiry", "quote"],
};

function normalize(value: string): string {
  return value.toLowerCase();
}

function matches(link: ParsedLink, keywords: string[]): boolean {
  let path = "";
  try {
    path = normalize(new URL(link.href).pathname);
  } catch {
    path = normalize(link.href);
  }
  const text = normalize(link.text);

  return keywords.some((keyword) => path.includes(keyword) || text.includes(keyword));
}

/**
 * Heuristic classification of a homepage's internal links into likely page
 * types. A link can land in more than one category (e.g. "/solutions" reads
 * as both product and service) — this is a coarse signal, not a crawler.
 */
export function classifyLinks(links: ParsedLink[]): Record<PageCategory, ParsedLink[]> {
  const result = {} as Record<PageCategory, ParsedLink[]>;
  for (const category of PAGE_CATEGORIES) {
    result[category] = [];
  }

  for (const link of links) {
    for (const category of PAGE_CATEGORIES) {
      if (matches(link, CATEGORY_KEYWORDS[category])) {
        result[category].push(link);
      }
    }
  }

  return result;
}
