import { describe, expect, it } from "vitest";
import { normalizeVendorRegistrationName, normalizeVendorRegistrationLink, buildVendorRegistrationDuplicateKey } from "./duplicate";

describe("normalizeVendorRegistrationName", () => {
  it("lowercases, strips punctuation/legal-suffixes, and collapses whitespace", () => {
    expect(normalizeVendorRegistrationName("  ADNOC   Corp.")).toBe("adnoc");
  });
});

describe("normalizeVendorRegistrationLink", () => {
  it("strips scheme, www, query string, and trailing slash", () => {
    expect(normalizeVendorRegistrationLink("https://www.adnoc.example.com/suppliers/register/?ref=x")).toBe("adnoc.example.com/suppliers/register");
  });
});

describe("buildVendorRegistrationDuplicateKey", () => {
  it("keys on the vendor registration link first", () => {
    const key = buildVendorRegistrationDuplicateKey("ws1", "ADNOC", "UAE", "www.adnoc.example.com", "https://adnoc.example.com/suppliers/");
    expect(key).toBe("ws1:link:adnoc.example.com/suppliers");
  });

  it("falls back to the website domain when there's no link", () => {
    const key = buildVendorRegistrationDuplicateKey("ws1", "ADNOC", "UAE", "www.adnoc.example.com", "");
    expect(key).toBe("ws1:domain:adnoc.example.com");
  });

  it("falls back to normalized name+country when neither link nor domain is available", () => {
    const key = buildVendorRegistrationDuplicateKey("ws1", "ADNOC", "UAE", "", "");
    expect(key).toBe("ws1:name:adnoc:uae");
  });

  it("scopes keys to the workspace so two workspaces never collide", () => {
    const keyA = buildVendorRegistrationDuplicateKey("ws1", "ADNOC", "UAE", "", "https://adnoc.example.com/register");
    const keyB = buildVendorRegistrationDuplicateKey("ws2", "ADNOC", "UAE", "", "https://adnoc.example.com/register");
    expect(keyA).not.toBe(keyB);
  });
});
