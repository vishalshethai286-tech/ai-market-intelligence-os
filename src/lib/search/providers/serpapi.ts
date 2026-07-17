import "server-only";
import { SERPAPI_ENDPOINT, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS } from "../constants";
import { fetchJson, domainFromUrl } from "../http";
import { SearchProviderNotConfiguredError } from "../errors";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

type SerpApiResponse = {
  organic_results?: { title?: string; link?: string; snippet?: string; displayed_link?: string }[];
};

/**
 * Placeholder SerpApi (Google Search API) integration — request/response
 * shape follows SerpApi's documented Search API, but hasn't been exercised
 * against a live key in this codebase. Verify against current SerpApi docs
 * before relying on it in production.
 */
export const serpApiSearchProvider: SearchProvider = {
  name: "SERPAPI",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      throw new SearchProviderNotConfiguredError("SERPAPI_API_KEY is not set.");
    }

    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);
    const url = `${SERPAPI_ENDPOINT}?engine=google&q=${encodeURIComponent(query)}&num=${maxResults}&api_key=${encodeURIComponent(apiKey)}`;

    const data = await fetchJson<SerpApiResponse>(url, { method: "GET" });

    const retrievedAt = new Date();
    return (data.organic_results ?? [])
      .filter((item) => Boolean(item.link))
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.link!,
        snippet: item.snippet ?? "",
        url: item.link!,
        domain: item.displayed_link || domainFromUrl(item.link!),
        provider: "SERPAPI" as const,
        retrievedAt,
        rawPayload: item,
      }));
  },
};
