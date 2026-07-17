import { describe, expect, it } from "vitest";
import { calculateCustomerDuplicateScore } from "./scoring";
import type { CustomerDuplicateCandidate } from "./scoring";
import { DUPLICATE_SCORE_THRESHOLDS } from "./constants";

const base: CustomerDuplicateCandidate = {
  customerName: "Acme Pumps",
  country: "USA",
  websiteDomain: "acme.com",
  address: "123 Main St, Springfield",
  phoneNumber: "+1 555 123 4567",
  sourceUrl: "https://acme.com/about",
};

describe("calculateCustomerDuplicateScore", () => {
  it("scores same website domain as a high-confidence auto-merge, even with nothing else matching", () => {
    const other: CustomerDuplicateCandidate = {
      customerName: "Completely Different Name LLC",
      country: "Canada",
      websiteDomain: "acme.com",
      address: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("websiteDomain");
  });

  it("scores same source URL as a high-confidence auto-merge", () => {
    const other: CustomerDuplicateCandidate = {
      customerName: "Totally Different Co",
      country: "Germany",
      websiteDomain: "otherdomain.com",
      address: "",
      phoneNumber: "",
      sourceUrl: "https://acme.com/about",
    };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("sourceUrl");
  });

  it("scores same normalized name + country + phone as a high-confidence auto-merge", () => {
    const other: CustomerDuplicateCandidate = {
      customerName: "Acme Pumps Inc.",
      country: "USA",
      websiteDomain: "",
      address: "",
      phoneNumber: "+1 (555) 123-4567",
      sourceUrl: "",
    };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores same name + same country alone (no phone/domain) as a possible duplicate, not an auto-merge", () => {
    const other: CustomerDuplicateCandidate = {
      customerName: "Acme Pumps",
      country: "USA",
      websiteDomain: "",
      address: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores two unrelated companies low", () => {
    const other: CustomerDuplicateCandidate = {
      customerName: "Zephyr Logistics",
      country: "India",
      websiteDomain: "zephyrlogistics.example",
      address: "456 Other Ave, Mumbai",
      phoneNumber: "+91 22 1234 5678",
      sourceUrl: "https://zephyrlogistics.example/contact",
    };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.review);
  });

  it("flags conflicting fields when domains disagree", () => {
    const other: CustomerDuplicateCandidate = { ...base, websiteDomain: "different.com" };
    const result = calculateCustomerDuplicateScore(base, other);
    expect(result.conflictingFields).toContain("websiteDomain");
  });
});

// calculateProjectDuplicateScore, calculateTenderBuyerDuplicateScore/
// calculateTenderOpportunityDuplicateScore, and calculateVendorRegistrationDuplicateScore
// are exercised directly in src/lib/dedup/project-scoring.test.ts (Phase 9),
// src/lib/dedup/tender-scoring.test.ts (Phase 10), and
// src/lib/dedup/vendor-registration-scoring.test.ts (Phase 11) — none of them
// are placeholders anymore now that their models exist.
