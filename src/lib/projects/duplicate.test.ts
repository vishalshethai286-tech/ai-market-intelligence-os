import { describe, expect, it } from "vitest";
import { normalizeClientName, normalizeProjectName, normalizeLocation, buildProjectDuplicateKey } from "./duplicate";

describe("normalizeClientName", () => {
  it("lowercases, strips punctuation/legal-suffixes, and collapses whitespace", () => {
    expect(normalizeClientName("  ACME   Industries!! Inc.")).toBe("acme industries");
  });
});

describe("normalizeProjectName / normalizeLocation", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeProjectName("New Refinery Expansion, Phase 2")).toBe("new refinery expansion phase 2");
    expect(normalizeLocation("Houston, TX")).toBe("houston tx");
  });
});

describe("buildProjectDuplicateKey", () => {
  it("keys on the project-information link when available", () => {
    const key = buildProjectDuplicateKey("ws1", "New Plant", "Acme Co", "Houston", "https://example.com/project/123");
    expect(key).toBe("ws1:link:example.com/project/123");
  });

  it("falls back to normalized client+project+location when there's no link", () => {
    // "Co" is stripped as a legal-entity suffix by normalizeClientName (same rules as customers/duplicate.ts).
    const key = buildProjectDuplicateKey("ws1", "New Plant", "Acme Co", "Houston", "");
    expect(key).toBe("ws1:name:acme:new plant:houston");
  });

  it("never collides a link-based key with a name-based key", () => {
    const linkKey = buildProjectDuplicateKey("ws1", "New Plant", "Acme Co", "Houston", "https://example.com/p");
    const nameKey = buildProjectDuplicateKey("ws1", "New Plant", "Acme Co", "Houston", "");
    expect(linkKey).not.toBe(nameKey);
  });

  it("scopes keys to the workspace so two workspaces never collide", () => {
    const keyA = buildProjectDuplicateKey("ws1", "New Plant", "Acme Co", "Houston", "https://example.com/p");
    const keyB = buildProjectDuplicateKey("ws2", "New Plant", "Acme Co", "Houston", "https://example.com/p");
    expect(keyA).not.toBe(keyB);
  });
});
