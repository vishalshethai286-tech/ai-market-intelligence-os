import { describe, expect, it } from "vitest";
import { computeTenderScore, scoreToTenderPriority } from "./scoring";
import type { ScorableTenderCandidate, TenderScoringContext } from "./scoring";

const baseContext: TenderScoringContext = {
  products: ["Stainless Steel Pipes"],
  targetIndustries: ["Oil & Gas"],
  countriesServed: ["USA"],
  tenderIndustry: "Oil & Gas",
};

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const perfectCandidate: ScorableTenderCandidate = {
  matchedProductServiceName: "Stainless Steel Pipes",
  buyerOrganization: "Public Works Department",
  tenderTitle: "Stainless Steel Pipes Supply",
  tenderDescription: "Supply of stainless steel pipes for a municipal water project.",
  country: "USA",
  endDate: futureDate,
  confidenceScore: 1,
  hasSnippet: true,
  isMockProvider: false,
};

const emptyCandidate: ScorableTenderCandidate = {
  matchedProductServiceName: "",
  buyerOrganization: "",
  tenderTitle: "",
  tenderDescription: "",
  country: "",
  endDate: "",
  confidenceScore: 0,
  hasSnippet: false,
  isMockProvider: true,
};

describe("scoreToTenderPriority", () => {
  it("maps thresholds to A+/A/B/C exactly as specified", () => {
    expect(scoreToTenderPriority(85)).toBe("A_PLUS");
    expect(scoreToTenderPriority(70)).toBe("A");
    expect(scoreToTenderPriority(50)).toBe("B");
    expect(scoreToTenderPriority(49.99)).toBe("C");
  });
});

describe("computeTenderScore", () => {
  it("scores a perfect-match, active tender as A+ priority", () => {
    const breakdown = computeTenderScore(perfectCandidate, baseContext);
    expect(breakdown.productMatch).toBe(100);
    expect(breakdown.industryMatch).toBe(100);
    expect(breakdown.buyerOrgClarity).toBe(100);
    expect(breakdown.titleDescriptionClarity).toBe(100);
    expect(breakdown.countryMatch).toBe(100);
    expect(breakdown.endDateAvailability).toBe(100);
    expect(breakdown.stillActive).toBe(100);
    expect(breakdown.sourceQuality).toBe(100);
    expect(breakdown.confidenceScore).toBe(100);
    expect(breakdown.priority).toBe("A_PLUS");
  });

  it("scores a fully-empty candidate as C priority", () => {
    const breakdown = computeTenderScore(emptyCandidate, baseContext);
    expect(breakdown.productMatch).toBe(0);
    expect(breakdown.buyerOrgClarity).toBe(0);
    expect(breakdown.titleDescriptionClarity).toBe(0);
    expect(breakdown.priority).toBe("C");
  });

  it("treats a missing end date as not-yet-expired (100), unlike a past end date (0)", () => {
    const unknownEndDate = computeTenderScore({ ...emptyCandidate, endDate: "" }, baseContext);
    const expired = computeTenderScore({ ...emptyCandidate, endDate: pastDate }, baseContext);
    const active = computeTenderScore({ ...emptyCandidate, endDate: futureDate }, baseContext);
    expect(unknownEndDate.stillActive).toBe(100);
    expect(active.stillActive).toBe(100);
    expect(expired.stillActive).toBe(0);
  });

  it("gives half credit for title-only or description-only clarity, full credit for both", () => {
    const titleOnly = computeTenderScore({ ...emptyCandidate, tenderTitle: "Pipes Supply" }, baseContext);
    const both = computeTenderScore({ ...emptyCandidate, tenderTitle: "Pipes Supply", tenderDescription: "Supply of pipes." }, baseContext);
    expect(titleOnly.titleDescriptionClarity).toBe(50);
    expect(both.titleDescriptionClarity).toBe(100);
  });

  it("rewards a real (non-mock) provider over a mock one, all else equal", () => {
    const real = computeTenderScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: false }, baseContext);
    const mock = computeTenderScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: true }, baseContext);
    expect(real.sourceQuality).toBeGreaterThan(mock.sourceQuality);
  });
});
