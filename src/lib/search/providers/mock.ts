import { DEFAULT_MAX_RESULTS } from "../constants";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

/** Fixed pool of fake domains, cycled through so results stay deterministic across calls. */
const MOCK_DOMAINS = ["example.com", "sample-news.test", "mockindustry.test", "demo-directory.test", "placeholder-wire.test"];

/**
 * Manual mock provider for local development and tests — makes no network
 * call and needs no API key. Returns deterministic, query-aware canned
 * results so UI work can proceed without live search provider credentials.
 */
export const mockSearchProvider: SearchProvider = {
  name: "MOCK",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MOCK_DOMAINS.length);

    return Array.from({ length: maxResults }, (_, i) => {
      const domain = MOCK_DOMAINS[i % MOCK_DOMAINS.length];
      return {
        title: `${query} — mock result ${i + 1}`,
        snippet: `This is a mock search result for "${query}", generated locally for development. No real network request was made.`,
        url: `https://${domain}/search?q=${encodeURIComponent(query)}`,
        domain,
        provider: "MOCK" as const,
      };
    });
  },
};
