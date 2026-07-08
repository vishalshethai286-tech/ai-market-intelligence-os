import "server-only";
import { SEARCH_FETCH_TIMEOUT_MS } from "./constants";
import { SearchProviderRequestError } from "./errors";

/**
 * Fetches JSON from a fixed, trusted API endpoint (Tavily/Exa/Bing/Google —
 * never a user-supplied URL, so this deliberately has none of the SSRF
 * guarding `website-analyzer/safe-fetch.ts` needs), bounded by a timeout.
 */
export async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new SearchProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? "Search request timed out." : "Search request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new SearchProviderRequestError(`Search provider responded with HTTP ${response.status}.`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new SearchProviderRequestError("Search provider returned an invalid JSON response.");
  }
}

/** Best-effort hostname extraction; returns the original string if it isn't a valid URL. */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
