import { DEFAULT_MAX_RESULTS } from "../constants";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

/** Fixed pool of fake domains, cycled through so results stay deterministic across calls. */
const MOCK_DOMAINS = ["example.com", "sample-news.test", "mockindustry.test", "demo-directory.test", "placeholder-wire.test"];

/** Per-searchType templates so mock results look plausible enough to test the UI and downstream extraction, not just "mock result N". */
const TEMPLATES: Record<
  NonNullable<SearchOptions["searchType"]>,
  { title: (q: string, i: number) => string; snippet: (q: string) => string }
> = {
  CUSTOMER: {
    title: (q, i) => `${i + 1} companies matching "${q}" | Industry Directory`,
    snippet: (q) => `Browse verified companies related to "${q}". Company profiles include contact details, location, and product lines.`,
  },
  PROJECT: {
    title: (q, i) => `Project announcement: ${q} (#${i + 1})`,
    snippet: (q) => `A newly announced project matching "${q}" — expansion, new facility, or EPC award reported by a local industry news source.`,
  },
  TENDER: {
    title: (q, i) => `Tender notice #${i + 1}: ${q}`,
    snippet: (q) => `Open tender/procurement opportunity matching "${q}". Submission deadline and eligibility criteria listed on the portal.`,
  },
  VENDOR_REGISTRATION: {
    title: (q, i) => `Supplier/vendor registration portal (${i + 1}): ${q}`,
    snippet: (q) => `Register as an approved vendor/supplier matching "${q}". Includes registration requirements and required documentation.`,
  },
  CONTACT: {
    title: (q, i) => CONTACT_TITLE_TEMPLATES[i % CONTACT_TITLE_TEMPLATES.length](q),
    snippet: (q) =>
      `Public contact information related to "${q}" — sourced from a company website, supplier portal, tender document, or public directory. No private or login-restricted content included.`,
  },
};

/** Cycled by result index so a single mock search call returns visibly different (but still deterministic) contact-page-style titles, matching the Phase 11.5B spec's worked examples. */
const CONTACT_TITLE_TEMPLATES: ((q: string) => string)[] = [
  (q) => `Procurement Contacts | ${q}`,
  (q) => `Supplier Registration Contact - ${q}`,
  (q) => `Management Team | ${q}`,
  (q) => `Tender Contact Details - ${q}`,
  (q) => `Vendor Portal Helpdesk | ${q}`,
  (q) => `Conference Speaker Bio - Head of Procurement at ${q}`,
];

/**
 * Manual mock provider for local development and tests — makes no network
 * call and needs no API key. Returns deterministic, query-and-searchType-aware
 * canned results so UI work and downstream extraction can proceed without
 * live search provider credentials.
 */
export const mockSearchProvider: SearchProvider = {
  name: "MOCK",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MOCK_DOMAINS.length);
    const template = options?.searchType ? TEMPLATES[options.searchType] : null;
    const retrievedAt = new Date();

    return Array.from({ length: maxResults }, (_, i) => {
      const domain = MOCK_DOMAINS[i % MOCK_DOMAINS.length];
      return {
        title: template ? template.title(query, i) : `${query} — mock result ${i + 1}`,
        snippet: template
          ? template.snippet(query)
          : `This is a mock search result for "${query}", generated locally for development. No real network request was made.`,
        url: `https://${domain}/search?q=${encodeURIComponent(query)}`,
        domain,
        provider: "MOCK" as const,
        retrievedAt,
      };
    });
  },
};
