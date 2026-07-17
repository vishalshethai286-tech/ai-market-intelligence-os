import { describe, expect, it } from "vitest";
import { calculateVendorRegistrationDuplicateScore } from "./scoring";
import type { VendorRegistrationDuplicateCandidate } from "./scoring";
import { DUPLICATE_SCORE_THRESHOLDS } from "./constants";

const base: VendorRegistrationDuplicateCandidate = {
  customerName: "ADNOC",
  country: "United Arab Emirates",
  websiteDomain: "adnoc.example.com",
  vendorRegistrationLink: "https://adnoc.example.com/suppliers/register",
  phoneNumber: "+971 2 602 0000",
  sourceUrl: "https://adnoc.example.com/suppliers",
};

describe("calculateVendorRegistrationDuplicateScore", () => {
  it("scores same website domain as a high-confidence auto-merge, even with nothing else matching", () => {
    const other: VendorRegistrationDuplicateCandidate = {
      customerName: "Completely Different Name",
      country: "Saudi Arabia",
      websiteDomain: "adnoc.example.com",
      vendorRegistrationLink: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateVendorRegistrationDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("websiteDomain");
  });

  it("scores same vendor registration link as a high-confidence auto-merge", () => {
    const other: VendorRegistrationDuplicateCandidate = {
      customerName: "Different Co",
      country: "Saudi Arabia",
      websiteDomain: "different.com",
      vendorRegistrationLink: "https://adnoc.example.com/suppliers/register",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateVendorRegistrationDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("vendorRegistrationLink");
  });

  it("scores same source URL as a high-confidence auto-merge", () => {
    const other: VendorRegistrationDuplicateCandidate = {
      customerName: "Different Co",
      country: "Saudi Arabia",
      websiteDomain: "different.com",
      vendorRegistrationLink: "",
      phoneNumber: "",
      sourceUrl: "https://adnoc.example.com/suppliers",
    };
    const result = calculateVendorRegistrationDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores same name + same country alone as a possible duplicate, not an auto-merge", () => {
    const other: VendorRegistrationDuplicateCandidate = {
      customerName: "ADNOC",
      country: "United Arab Emirates",
      websiteDomain: "",
      vendorRegistrationLink: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateVendorRegistrationDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores two unrelated vendor registrations low", () => {
    const other: VendorRegistrationDuplicateCandidate = {
      customerName: "Zephyr Municipal Council",
      country: "India",
      websiteDomain: "zephyrcouncil.example",
      vendorRegistrationLink: "https://zephyrcouncil.example/register",
      phoneNumber: "+91 22 1234 5678",
      sourceUrl: "https://zephyrcouncil.example/about",
    };
    const result = calculateVendorRegistrationDuplicateScore(base, other);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.review);
  });
});
