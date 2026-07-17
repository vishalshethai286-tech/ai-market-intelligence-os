import { describe, expect, it } from "vitest";
import { normalizeCompanyName, normalizeDomain, normalizePhone, normalizeAddress, normalizeUrl, calculateStringSimilarity } from "./normalize";

describe("normalizeCompanyName", () => {
  it("lowercases, strips punctuation/suffixes, and collapses whitespace", () => {
    expect(normalizeCompanyName("  ACME   Pumps!! ")).toBe("acme pumps");
    expect(normalizeCompanyName("Acme Pumps Pvt Ltd")).toBe("acme pumps");
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path, and trailing slash", () => {
    expect(normalizeDomain("https://www.acme.com/products/")).toBe("acme.com");
  });
});

describe("normalizePhone", () => {
  it("keeps only digits (and a leading +)", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("+1 555 123 4567")).toBe("+15551234567");
  });
});

describe("normalizeAddress", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeAddress("123 Main St., Suite #400")).toBe("123 main st suite 400");
  });

  it("treats equivalent addresses (formatting-only differences) as equal after normalization", () => {
    expect(normalizeAddress("123 Main St, Suite 400")).toBe(normalizeAddress("123   MAIN st.   suite   400"));
  });
});

describe("normalizeUrl", () => {
  it("strips scheme, www, query string, fragment, and trailing slash", () => {
    expect(normalizeUrl("https://www.example.com/about/?ref=x#top")).toBe("example.com/about");
  });

  it("treats http and https as the same canonical URL", () => {
    expect(normalizeUrl("http://example.com/about")).toBe(normalizeUrl("https://www.example.com/about/"));
  });
});

describe("calculateStringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(calculateStringSimilarity("acme pumps", "acme pumps")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(calculateStringSimilarity("acme pumps", "zephyr logistics")).toBeLessThan(0.3);
  });

  it("returns a high score for near-identical strings", () => {
    expect(calculateStringSimilarity("acme pumps inc", "acme pumps incorporated")).toBeGreaterThan(0.7);
  });

  it("is symmetric", () => {
    expect(calculateStringSimilarity("acme pumps", "acme pump")).toBeCloseTo(calculateStringSimilarity("acme pump", "acme pumps"), 10);
  });
});
