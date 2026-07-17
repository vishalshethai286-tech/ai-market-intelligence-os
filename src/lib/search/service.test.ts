import { afterEach, describe, expect, it, vi } from "vitest";
import { search, resolveProviderName } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mock search provider", () => {
  it("returns deterministic, query-aware results with no network call", async () => {
    const results = await search("centrifugal pumps", { provider: "MOCK", maxResults: 3 });
    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result.provider).toBe("MOCK");
      expect(result.title).toContain("centrifugal pumps");
      expect(result.url).toMatch(/^https:\/\//);
      expect(result.retrievedAt).toBeInstanceOf(Date);
    }
  });

  it("varies its templates by searchType", async () => {
    const customer = await search("acme pumps", { provider: "MOCK", searchType: "CUSTOMER", maxResults: 1 });
    const tender = await search("acme pumps", { provider: "MOCK", searchType: "TENDER", maxResults: 1 });
    expect(customer[0].title).not.toBe(tender[0].title);
    expect(tender[0].title.toLowerCase()).toContain("tender");
  });

  it("supports searchType=CONTACT with realistic public-contact-flavored titles", async () => {
    const results = await search("ADNOC procurement contact", { provider: "MOCK", searchType: "CONTACT", maxResults: 5 });
    expect(results.length).toBe(5);
    const combinedTitles = results.map((r) => r.title).join(" | ");
    expect(/procurement|supplier|management|tender|vendor|conference/i.test(combinedTitles)).toBe(true);
    for (const result of results) {
      expect(result.provider).toBe("MOCK");
      expect(result.url).toMatch(/^https:\/\//);
    }
  });

  it("short-circuits an empty/whitespace query to no results without calling the provider", async () => {
    expect(await search("   ", { provider: "MOCK" })).toEqual([]);
  });
});

describe("search provider selection", () => {
  it("ENABLE_MOCK_SEARCH=true always resolves to MOCK regardless of SEARCH_PROVIDER", () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "true");
    vi.stubEnv("SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "fake-key");
    expect(resolveProviderName()).toBe("MOCK");
  });

  it("falls back to MOCK when nothing is configured", () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "");
    vi.stubEnv("SEARCH_PROVIDER", "");
    expect(resolveProviderName()).toBe("MOCK");
  });

  it("resolves to the configured provider once its key is present", () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "");
    vi.stubEnv("SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "fake-key");
    expect(resolveProviderName()).toBe("TAVILY");
  });

  it("falls back to MOCK outside production when the configured provider's key is missing (Tavily fallback)", () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "");
    vi.stubEnv("SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(resolveProviderName()).toBe("MOCK");
  });

  it("throws a clear configuration error in production when the configured provider's key is missing", () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "");
    vi.stubEnv("SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveProviderName()).toThrow(/TAVILY/);
  });
});
