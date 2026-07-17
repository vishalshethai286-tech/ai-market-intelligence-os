import "server-only";
import { tavilySearchProvider } from "./providers/tavily";
import { exaSearchProvider } from "./providers/exa";
import { bingSearchProvider } from "./providers/bing";
import { googleCseSearchProvider } from "./providers/google-cse";
import { serpApiSearchProvider } from "./providers/serpapi";
import { mockSearchProvider } from "./providers/mock";
import { UnknownSearchProviderError, SearchProviderNotConfiguredError } from "./errors";
import type { SearchProvider, SearchProviderName, SearchOptions, SearchResult } from "./types";

const PROVIDERS: Record<SearchProviderName, SearchProvider> = {
  TAVILY: tavilySearchProvider,
  EXA: exaSearchProvider,
  BING: bingSearchProvider,
  GOOGLE_CSE: googleCseSearchProvider,
  SERPAPI: serpApiSearchProvider,
  MOCK: mockSearchProvider,
};

/** Whether a provider's required API key(s) are present — MOCK always is, since it needs none. */
function isProviderConfigured(name: SearchProviderName): boolean {
  switch (name) {
    case "TAVILY":
      return Boolean(process.env.TAVILY_API_KEY);
    case "EXA":
      return Boolean(process.env.EXA_API_KEY);
    case "BING":
      return Boolean(process.env.BING_SEARCH_API_KEY);
    case "GOOGLE_CSE":
      return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
    case "SERPAPI":
      return Boolean(process.env.SERPAPI_API_KEY);
    case "MOCK":
      return true;
  }
}

/**
 * Which provider to use when the caller doesn't name one explicitly:
 * 1. `ENABLE_MOCK_SEARCH=true` always wins — no network call, no key needed.
 * 2. `SEARCH_PROVIDER` (e.g. "tavily") if it names a registered provider AND
 *    that provider's API key(s) are set.
 * 3. If `SEARCH_PROVIDER` is set but its key(s) are missing: fall back to
 *    MOCK outside production (so local dev never hard-fails on a missing
 *    key), but throw a clear configuration error in production rather than
 *    silently degrading to fake results.
 * 4. Nothing configured at all → MOCK, so any environment without search
 *    API keys still works out of the box.
 */
export function resolveProviderName(): SearchProviderName {
  if (process.env.ENABLE_MOCK_SEARCH === "true") return "MOCK";

  const configured = process.env.SEARCH_PROVIDER?.toUpperCase();
  if (configured && configured in PROVIDERS) {
    const name = configured as SearchProviderName;
    if (isProviderConfigured(name)) return name;
    if (process.env.NODE_ENV !== "production") return "MOCK";
    throw new SearchProviderNotConfiguredError(
      `SEARCH_PROVIDER is set to "${configured}" but its required API key(s) are not configured.`,
    );
  }

  return "MOCK";
}

/**
 * Runs a search against the configured provider (Tavily, Exa, Bing, Google
 * CSE, SerpApi, or the no-network Mock provider), returning a uniform result
 * shape regardless of which provider answered. Pass `provider` to override
 * the default (e.g. to compare providers, or use a workspace-level
 * preference).
 *
 * Empty/whitespace-only queries short-circuit to `[]` without calling the
 * provider at all.
 */
export async function search(
  query: string,
  options?: SearchOptions & { provider?: SearchProviderName },
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const providerName = options?.provider ?? resolveProviderName();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new UnknownSearchProviderError(`Unknown search provider: ${providerName}`);
  }

  return provider.search(trimmed, options);
}
