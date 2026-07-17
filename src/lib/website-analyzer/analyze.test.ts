import { describe, expect, it } from "vitest";
import { analyzeWebsite } from "./analyze";
import { classifyLinks, PAGE_CATEGORIES } from "./classify";

describe("analyzeWebsite fallback behavior", () => {
  it("never throws, and returns ok:false for a blocked hostname (no network involved)", async () => {
    const result = await analyzeWebsite("http://localhost/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsafe_url");
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects the cloud metadata IP without making a request", async () => {
    const result = await analyzeWebsite("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_url");
  });

  it("rejects a private-range IP literal", async () => {
    const result = await analyzeWebsite("http://10.0.0.5/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_url");
  });

  it("rejects a non-http(s) protocol", async () => {
    const result = await analyzeWebsite("ftp://example.com/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_url");
  });

  it("rejects a non-standard port", async () => {
    const result = await analyzeWebsite("http://example.com:8080/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_url");
  });

  it("rejects a malformed URL string", async () => {
    const result = await analyzeWebsite("not a url at all");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_url");
  });
});

describe("classifyLinks", () => {
  it("recognizes every declared page category, including the new Phase 3 ones", () => {
    expect(PAGE_CATEGORIES).toEqual(
      expect.arrayContaining(["product", "service", "about", "industries", "applications", "catalog", "contact", "downloads", "blog", "news"]),
    );
  });

  it("classifies links into their expected categories", () => {
    const result = classifyLinks([
      { href: "https://acme.com/products", text: "Products" },
      { href: "https://acme.com/services", text: "Services" },
      { href: "https://acme.com/applications", text: "Applications" },
      { href: "https://acme.com/downloads", text: "Downloads" },
      { href: "https://acme.com/blog", text: "Blog" },
      { href: "https://acme.com/news", text: "Press & News" },
      { href: "https://acme.com/contact-us", text: "Contact" },
    ]);

    expect(result.product.map((l) => l.href)).toContain("https://acme.com/products");
    expect(result.service.map((l) => l.href)).toContain("https://acme.com/services");
    expect(result.applications.map((l) => l.href)).toContain("https://acme.com/applications");
    expect(result.downloads.map((l) => l.href)).toContain("https://acme.com/downloads");
    expect(result.blog.map((l) => l.href)).toContain("https://acme.com/blog");
    expect(result.news.map((l) => l.href)).toContain("https://acme.com/news");
    expect(result.contact.map((l) => l.href)).toContain("https://acme.com/contact-us");
  });

  it("returns an empty array for a category with no matching links, not undefined", () => {
    const result = classifyLinks([{ href: "https://acme.com/random-page", text: "Random" }]);
    for (const category of PAGE_CATEGORIES) {
      expect(Array.isArray(result[category])).toBe(true);
    }
  });
});
