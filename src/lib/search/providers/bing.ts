import "server-only";
import { BING_ENDPOINT, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS } from "../constants";
import { fetchJson, domainFromUrl } from "../http";
import { SearchProviderNotConfiguredError } from "../errors";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

type BingResponse = {
  webPages?: { value?: { name?: string; url?: string; snippet?: string; displayUrl?: string }[] };
};

/**
 * Placeholder Bing Web Search integration — request/response shape follows
 * Bing's documented v7 REST API, but hasn't been exercised against a live
 * key in this codebase. Verify against current Bing docs before relying on
 * it in production.
 */
export const bingSearchProvider: SearchProvider = {
  name: "BING",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    if (!apiKey) {
      throw new SearchProviderNotConfiguredError("BING_SEARCH_API_KEY is not set.");
    }

    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);
    const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&count=${maxResults}`;

    const data = await fetchJson<BingResponse>(url, {
      method: "GET",
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });

    return (data.webPages?.value ?? [])
      .filter((item) => Boolean(item.url))
      .slice(0, maxResults)
      .map((item) => ({
        title: item.name || item.url!,
        snippet: item.snippet ?? "",
        url: item.url!,
        domain: item.displayUrl || domainFromUrl(item.url!),
        provider: "BING" as const,
      }));
  },
};
