export type SearchProviderName = "TAVILY" | "EXA" | "BING" | "GOOGLE_CSE" | "MOCK";

export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
  domain: string;
  provider: SearchProviderName;
};

export type SearchOptions = {
  /** Upper bound on how many results to return. Providers may return fewer. */
  maxResults?: number;
};

export interface SearchProvider {
  readonly name: SearchProviderName;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
