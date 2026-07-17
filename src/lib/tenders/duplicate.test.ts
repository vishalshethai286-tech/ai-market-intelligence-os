import { describe, expect, it } from "vitest";
import { normalizeBuyerOrganization, normalizeTenderTitle, normalizeTenderLink, buildTenderBuyerDuplicateKey, buildTenderOpportunityDuplicateKey } from "./duplicate";

describe("normalizeBuyerOrganization / normalizeTenderTitle", () => {
  it("lowercases, strips punctuation/legal-suffixes, and collapses whitespace", () => {
    expect(normalizeBuyerOrganization("  Qatar   Energy!! Corp.")).toBe("qatar energy");
    expect(normalizeTenderTitle("Stainless Steel Pipes, and Fittings")).toBe("stainless steel pipes and fittings");
  });
});

describe("normalizeTenderLink", () => {
  it("strips scheme, www, query string, and trailing slash", () => {
    expect(normalizeTenderLink("https://www.example.gov/tenders/123/?ref=x")).toBe("example.gov/tenders/123");
  });
});

describe("buildTenderBuyerDuplicateKey", () => {
  it("keys on the website domain first", () => {
    const key = buildTenderBuyerDuplicateKey("ws1", "Qatar Energy", "Qatar", "www.qatarenergy.com", "https://qatarenergy.com/tenders");
    expect(key).toBe("ws1:domain:qatarenergy.com");
  });

  it("falls back to the tender website link when there's no domain", () => {
    const key = buildTenderBuyerDuplicateKey("ws1", "Qatar Energy", "Qatar", "", "https://qatarenergy.com/tenders/");
    expect(key).toBe("ws1:link:qatarenergy.com/tenders");
  });

  it("falls back to normalized name+country when neither domain nor link is available", () => {
    const key = buildTenderBuyerDuplicateKey("ws1", "Qatar Energy", "Qatar", "", "");
    expect(key).toBe("ws1:name:qatar energy:qatar");
  });
});

describe("buildTenderOpportunityDuplicateKey", () => {
  it("keys on the tender link first", () => {
    const key = buildTenderOpportunityDuplicateKey("ws1", "https://tenders.example.gov/pipes-2027/", "Public Works Department", "Pipes Supply", "USA");
    expect(key).toBe("ws1:link:tenders.example.gov/pipes-2027");
  });

  it("falls back to normalized buyerOrganization+tenderTitle+country when there's no link", () => {
    const key = buildTenderOpportunityDuplicateKey("ws1", "", "Public Works Department", "Pipes Supply", "USA");
    expect(key).toBe("ws1:name:public works department:pipes supply:usa");
  });

  it("scopes keys to the workspace so two workspaces never collide", () => {
    const keyA = buildTenderOpportunityDuplicateKey("ws1", "https://tenders.example.gov/pipes", "Public Works", "Pipes", "USA");
    const keyB = buildTenderOpportunityDuplicateKey("ws2", "https://tenders.example.gov/pipes", "Public Works", "Pipes", "USA");
    expect(keyA).not.toBe(keyB);
  });
});
