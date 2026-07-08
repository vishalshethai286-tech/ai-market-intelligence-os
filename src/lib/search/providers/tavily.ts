import "server-only";
import { TAVILY_ENDPOINT, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS } from "../constants";
import { fetchJson, domainFromUrl } from "../http";
import { SearchProviderNotConfiguredError } from "../errors";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

type TavilyResponse = {
  results?: { title?: string; content?: string; url?: string }[];
};

/**
 * Placeholder Tavily integration — request/response shape follows Tavily's
 * documented REST API (https://docs.tavily.com), but hasn't been exercised
 * against a live key in this codebase. Verify against current Tavily docs
 * before relying on it in production.
 */
export const tavilySearchProvider: SearchProvider = {
  name: "TAVILY",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new SearchProviderNotConfiguredError("TAVILY_API_KEY is not set.");
    }

    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);

    const data = await fetchJson<TavilyResponse>(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
    });

    return (data.results ?? [])
      .filter((item) => Boolean(item.url))
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.url!,
        snippet: item.content ?? "",
        url: item.url!,
        domain: domainFromUrl(item.url!),
        provider: "TAVILY" as const,
      }));
  },
};
