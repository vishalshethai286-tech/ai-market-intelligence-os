import "server-only";
import { EXA_ENDPOINT, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS } from "../constants";
import { fetchJson, domainFromUrl } from "../http";
import { SearchProviderNotConfiguredError } from "../errors";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

const SNIPPET_LENGTH = 300;

type ExaResponse = {
  results?: { title?: string | null; url?: string; text?: string; highlights?: string[] }[];
};

/**
 * Placeholder Exa integration — request/response shape follows Exa's
 * documented REST API (https://docs.exa.ai), but hasn't been exercised
 * against a live key in this codebase. Verify against current Exa docs
 * before relying on it in production.
 */
export const exaSearchProvider: SearchProvider = {
  name: "EXA",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw new SearchProviderNotConfiguredError("EXA_API_KEY is not set.");
    }

    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS);

    const data = await fetchJson<ExaResponse>(EXA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query, numResults: maxResults, contents: { text: true } }),
    });

    return (data.results ?? [])
      .filter((item) => Boolean(item.url))
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.url!,
        snippet: (item.highlights?.[0] ?? item.text ?? "").slice(0, SNIPPET_LENGTH),
        url: item.url!,
        domain: domainFromUrl(item.url!),
        provider: "EXA" as const,
      }));
  },
};
