import "server-only";
import { GOOGLE_CSE_ENDPOINT, DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS } from "../constants";
import { fetchJson, domainFromUrl } from "../http";
import { SearchProviderNotConfiguredError } from "../errors";
import type { SearchProvider, SearchResult, SearchOptions } from "../types";

/** Google CSE caps `num` at 10 results per request, unlike the other providers. */
const GOOGLE_CSE_MAX_NUM = 10;

type GoogleCseResponse = {
  items?: { title?: string; link?: string; snippet?: string; displayLink?: string }[];
};

/**
 * Placeholder Google Programmable Search Engine (CSE) integration —
 * request/response shape follows Google's documented Custom Search JSON API,
 * but hasn't been exercised against a live key in this codebase. Verify
 * against current Google docs before relying on it in production. Needs both
 * an API key and a Search Engine ID (`cx`), unlike the other providers.
 */
export const googleCseSearchProvider: SearchProvider = {
  name: "GOOGLE_CSE",

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    if (!apiKey || !cx) {
      throw new SearchProviderNotConfiguredError("GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX must both be set.");
    }

    const maxResults = Math.min(options?.maxResults ?? DEFAULT_MAX_RESULTS, MAX_MAX_RESULTS, GOOGLE_CSE_MAX_NUM);
    const url = `${GOOGLE_CSE_ENDPOINT}?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${maxResults}`;

    const data = await fetchJson<GoogleCseResponse>(url, { method: "GET" });

    const retrievedAt = new Date();
    return (data.items ?? [])
      .filter((item) => Boolean(item.link))
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.link!,
        snippet: item.snippet ?? "",
        url: item.link!,
        domain: item.displayLink || domainFromUrl(item.link!),
        provider: "GOOGLE_CSE" as const,
        retrievedAt,
        rawPayload: item,
      }));
  },
};
