import { describe, expect, it } from "vitest";
import { normalizeCompanyName, normalizeDomain, normalizePhone, buildCustomerDuplicateKey } from "./duplicate";

describe("normalizeCompanyName", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeCompanyName("  ACME   Pumps!! ")).toBe("acme pumps");
  });

  it("strips a trailing legal-entity suffix", () => {
    expect(normalizeCompanyName("Acme Pumps Inc.")).toBe("acme pumps");
    expect(normalizeCompanyName("Acme Pumps LLC")).toBe("acme pumps");
    expect(normalizeCompanyName("Acme Pvt Ltd")).toBe("acme");
  });

  it("treats equivalent names as equal after normalization", () => {
    expect(normalizeCompanyName("Acme Pumps, Inc.")).toBe(normalizeCompanyName("acme pumps llc"));
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, path, and trailing slash", () => {
    expect(normalizeDomain("https://www.acme.com/products/")).toBe("acme.com");
  });

  it("tolerates a bare domain with no scheme", () => {
    expect(normalizeDomain("acme.com")).toBe("acme.com");
  });

  it("returns an empty string for an empty or unparsable value", () => {
    expect(normalizeDomain("")).toBe("");
  });
});

describe("normalizePhone", () => {
  it("strips formatting characters, keeping only digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("keeps a leading + for country codes", () => {
    expect(normalizePhone("+1 555 123 4567")).toBe("+15551234567");
  });

  it("returns an empty string when there are no digits", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("buildCustomerDuplicateKey", () => {
  it("keys on domain when a website domain is available", () => {
    const key = buildCustomerDuplicateKey("ws1", "Acme Pumps", "USA", "www.acme.com");
    expect(key).toBe("ws1:domain:acme.com");
  });

  it("falls back to normalized name + country when there's no domain", () => {
    const key = buildCustomerDuplicateKey("ws1", "Acme Pumps Inc.", "USA", "");
    expect(key).toBe("ws1:name:acme pumps:usa");
  });

  it("never collides a domain-based key with a name-based key", () => {
    const domainKey = buildCustomerDuplicateKey("ws1", "Acme Pumps", "USA", "acme.com");
    const nameKey = buildCustomerDuplicateKey("ws1", "Acme Pumps", "USA", "");
    expect(domainKey).not.toBe(nameKey);
  });

  it("scopes keys to the workspace so two workspaces never collide", () => {
    const keyA = buildCustomerDuplicateKey("ws1", "Acme Pumps", "USA", "acme.com");
    const keyB = buildCustomerDuplicateKey("ws2", "Acme Pumps", "USA", "acme.com");
    expect(keyA).not.toBe(keyB);
  });
});
