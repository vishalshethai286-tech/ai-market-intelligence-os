import { describe, expect, it } from "vitest";
import { calculateTenderBuyerDuplicateScore, calculateTenderOpportunityDuplicateScore } from "./scoring";
import type { TenderBuyerDuplicateCandidate, TenderOpportunityDuplicateCandidate } from "./scoring";
import { DUPLICATE_SCORE_THRESHOLDS } from "./constants";

const buyerBase: TenderBuyerDuplicateCandidate = {
  customerName: "Qatar Energy",
  country: "Qatar",
  websiteDomain: "qatarenergy.com",
  tenderWebsiteLink: "https://qatarenergy.com/tenders",
  phoneNumber: "+974 4013 2222",
  sourceUrl: "https://qatarenergy.com/suppliers",
};

describe("calculateTenderBuyerDuplicateScore", () => {
  it("scores same website domain as a high-confidence auto-merge, even with nothing else matching", () => {
    const other: TenderBuyerDuplicateCandidate = {
      customerName: "Completely Different Name",
      country: "UAE",
      websiteDomain: "qatarenergy.com",
      tenderWebsiteLink: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateTenderBuyerDuplicateScore(buyerBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("websiteDomain");
  });

  it("scores same tender website link as a high-confidence auto-merge", () => {
    const other: TenderBuyerDuplicateCandidate = {
      customerName: "Different Co",
      country: "UAE",
      websiteDomain: "different.com",
      tenderWebsiteLink: "https://qatarenergy.com/tenders",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateTenderBuyerDuplicateScore(buyerBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("tenderWebsiteLink");
  });

  it("scores same name + same country alone as a possible duplicate, not an auto-merge", () => {
    const other: TenderBuyerDuplicateCandidate = {
      customerName: "Qatar Energy",
      country: "Qatar",
      websiteDomain: "",
      tenderWebsiteLink: "",
      phoneNumber: "",
      sourceUrl: "",
    };
    const result = calculateTenderBuyerDuplicateScore(buyerBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores two unrelated buyers low", () => {
    const other: TenderBuyerDuplicateCandidate = {
      customerName: "Zephyr Municipal Council",
      country: "India",
      websiteDomain: "zephyrcouncil.example",
      tenderWebsiteLink: "https://zephyrcouncil.example/tenders",
      phoneNumber: "+91 22 1234 5678",
      sourceUrl: "https://zephyrcouncil.example/about",
    };
    const result = calculateTenderBuyerDuplicateScore(buyerBase, other);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.review);
  });
});

const opportunityBase: TenderOpportunityDuplicateCandidate = {
  buyerOrganization: "Public Works Department",
  tenderTitle: "Stainless Steel Pipes and Fittings Supply",
  tenderLink: "https://tenders.example.gov/pipes-2027",
  startDate: "2026-01-01",
  endDate: "2026-03-01",
  country: "USA",
  sourceUrl: "https://news.example.com/pipes-tender",
};

describe("calculateTenderOpportunityDuplicateScore", () => {
  it("scores same tender link as a high-confidence auto-merge, even with nothing else matching", () => {
    const other: TenderOpportunityDuplicateCandidate = {
      buyerOrganization: "Totally Different Org",
      tenderTitle: "Unrelated Tender",
      tenderLink: "https://tenders.example.gov/pipes-2027",
      startDate: "",
      endDate: "",
      country: "Canada",
      sourceUrl: "",
    };
    const result = calculateTenderOpportunityDuplicateScore(opportunityBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("tenderLink");
  });

  it("scores same source URL as a high-confidence auto-merge", () => {
    const other: TenderOpportunityDuplicateCandidate = {
      buyerOrganization: "Totally Different Org",
      tenderTitle: "Unrelated Tender",
      tenderLink: "",
      startDate: "",
      endDate: "",
      country: "Canada",
      sourceUrl: "https://news.example.com/pipes-tender",
    };
    const result = calculateTenderOpportunityDuplicateScore(opportunityBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores same buyer + title + country (no link) as a possible duplicate, not an auto-merge", () => {
    const other: TenderOpportunityDuplicateCandidate = {
      buyerOrganization: "Public Works Department",
      tenderTitle: "Stainless Steel Pipes and Fittings Supply",
      tenderLink: "",
      startDate: "",
      endDate: "",
      country: "USA",
      sourceUrl: "",
    };
    const result = calculateTenderOpportunityDuplicateScore(opportunityBase, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores two unrelated tenders low", () => {
    const other: TenderOpportunityDuplicateCandidate = {
      buyerOrganization: "Zephyr Transit Authority",
      tenderTitle: "Bus Fleet Electrification Program",
      tenderLink: "https://zephyr.example.gov/bus-tender",
      startDate: "2027-06-01",
      endDate: "2027-08-01",
      country: "India",
      sourceUrl: "https://zephyr.example.gov/news/bus-tender",
    };
    const result = calculateTenderOpportunityDuplicateScore(opportunityBase, other);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.review);
  });
});
