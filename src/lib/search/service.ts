import "server-only";
import { tavilySearchProvider } from "./providers/tavily";
import { exaSearchProvider } from "./providers/exa";
import { bingSearchProvider } from "./providers/bing";
import { googleCseSearchProvider } from "./providers/google-cse";
import { mockSearchProvider } from "./providers/mock";
import { UnknownSearchProviderError } from "./errors";
import type { SearchProvider, SearchProviderName, SearchOptions, SearchResult } from "./types";

const PROVIDERS: Record<SearchProviderName, SearchProvider> = {
  TAVILY: tavilySearchProvider,
  EXA: exaSearchProvider,
  BING: bingSearchProvider,
  GOOGLE_CSE: googleCseSearchProvider,
  MOCK: mockSearchProvider,
};

/**
 * Which provider to use when the caller doesn't name one explicitly: the
 * `SEARCH_PROVIDER` env var if it names a registered provider, otherwise
 * `MOCK` — so local development and any environment without search API keys
 * configured works out of the box, never silently fails.
 */
function defaultProviderName(): SearchProviderName {
  const configured = process.env.SEARCH_PROVIDER?.toUpperCase();
  if (configured && configured in PROVIDERS) {
    return configured as SearchProviderName;
  }
  return "MOCK";
}

/**
 * Runs a search against the configured provider (Tavily, Exa, Bing, Google
 * CSE, or the no-network Mock provider), returning a uniform result shape
 * regardless of which provider answered. Pass `provider` to override the
 * default (e.g. to compare providers, or use a workspace-level preference).
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

  const providerName = options?.provider ?? defaultProviderName();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new UnknownSearchProviderError(`Unknown search provider: ${providerName}`);
  }

  return provider.search(trimmed, options);
}
