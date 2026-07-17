export type SearchProviderName = "TAVILY" | "EXA" | "BING" | "GOOGLE_CSE" | "SERPAPI" | "MOCK";

export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
  domain: string;
  provider: SearchProviderName;
  /** When this result was retrieved — set by the provider at response time. */
  retrievedAt: Date;
  /** The provider's raw per-result payload, for debugging/reprocessing without a fresh call. Not set by the mock provider (there's no "raw" response). */
  rawPayload?: unknown;
};

export type SearchOptions = {
  /** Upper bound on how many results to return. Providers may return fewer. */
  maxResults?: number;
  /** ISO 3166-1 alpha-2 country code — only the mock provider varies output on this today; real providers accept it but may not all support geo-targeting. */
  country?: string;
  /** ISO 639-1 language code — same caveat as `country`. */
  language?: string;
  /** What kind of discovery this search is for — lets the mock provider return type-appropriate fake results. */
  searchType?: "CUSTOMER" | "PROJECT" | "TENDER" | "VENDOR_REGISTRATION" | "CONTACT";
};

export interface SearchProvider {
  readonly name: SearchProviderName;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
