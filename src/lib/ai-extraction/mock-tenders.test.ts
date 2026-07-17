import { describe, expect, it } from "vitest";
import { mockExtractTenderCandidate } from "./mock-tenders";
import { TenderCandidateSchema } from "@/lib/tenders/schema";
import type { TenderExtractionContext } from "@/lib/tenders/prompt";
import type { RawSearchResult } from "@/models";

const context: TenderExtractionContext = {
  companyName: "Our Company",
  industry: "Industrial Equipment",
  businessDescription: "We manufacture pumps and pipes.",
  productChoices: ["Stainless Steel Pipes"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["Government"],
  countriesServed: ["USA"],
};

function rawResult(overrides: Partial<RawSearchResult> = {}): RawSearchResult {
  return {
    id: "raw1",
    workspaceId: "ws1",
    discoveryRunId: "run1",
    discoveryRunItemId: "item1",
    searchQueryId: "query1",
    searchQueueItemId: "queue1",
    searchType: "TENDER",
    query: "pipes tender Qatar",
    title: "Supplier Registration / Procurement Portal | Qatar Energy",
    snippet: "Register as a supplier on the Qatar Energy procurement portal.",
    url: "https://qatarenergy.example.com/suppliers",
    domain: "qatarenergy.example.com",
    country: "Qatar",
    language: "en",
    sourceProvider: "MOCK",
    retrievedAt: new Date(),
    processedStatus: "UNPROCESSED",
    extractionStatus: "NOT_STARTED",
    rawPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("mockExtractTenderCandidate — tender buyer example", () => {
  it("is deterministic — the same input always produces the same output", () => {
    const result = rawResult();
    expect(mockExtractTenderCandidate(result, context)).toEqual(mockExtractTenderCandidate(result, context));
  });

  it("classifies a procurement-portal title as TENDER_BUYER, not BOTH", () => {
    const result = mockExtractTenderCandidate(rawResult(), context);
    expect(result.isRelevant).toBe(true);
    expect(result.extractionType).toBe("TENDER_BUYER");
    expect(result.customerName).toBe("Qatar Energy");
    expect(result.country).toBe("Qatar");
    expect(result.tenderWebsiteLink).toBe("https://qatarenergy.example.com/suppliers");
    expect(result.tenderTitle).toBe("");
  });

  it("excludes obvious directory/social domains", () => {
    const result = mockExtractTenderCandidate(rawResult({ domain: "www.linkedin.com", title: "Qatar Energy - LinkedIn" }), context);
    expect(result.isRelevant).toBe(false);
    expect(result.extractionType).toBe("NONE");
  });

  it("produces output that passes the Zod validation schema", () => {
    const result = mockExtractTenderCandidate(rawResult(), context);
    expect(TenderCandidateSchema.safeParse(result).success).toBe(true);
  });
});

describe("mockExtractTenderCandidate — live tender opportunity example", () => {
  function opportunityResult(overrides: Partial<RawSearchResult> = {}) {
    return rawResult({
      title: "Tender for Stainless Steel Pipes and Fittings",
      snippet: "This tender is issued by the Public Works Department for the supply of pipes and fittings.",
      url: "https://tenders.example.gov/pipes-2027",
      domain: "tenders.example.gov",
      ...overrides,
    });
  }

  it("classifies a 'tender for X' title as TENDER_OPPORTUNITY", () => {
    const result = mockExtractTenderCandidate(opportunityResult(), context);
    expect(result.isRelevant).toBe(true);
    expect(result.extractionType).toBe("TENDER_OPPORTUNITY");
    expect(result.tenderTitle).toBe("Stainless Steel Pipes and Fittings");
    expect(result.buyerOrganization).toBe("Public Works Department");
    expect(result.tenderLink).toBe("https://tenders.example.gov/pipes-2027");
    expect(result.productsServicesRequired).toEqual(["Stainless Steel Pipes", "Fittings"]);
    expect(result.matchedProductServiceName).toBe("Stainless Steel Pipes");
  });

  it("extracts a deterministic future end date", () => {
    const result = mockExtractTenderCandidate(opportunityResult(), context);
    expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(result.endDate).getTime()).toBeGreaterThan(Date.now());
    expect(result.endDate).toBe(mockExtractTenderCandidate(opportunityResult(), context).endDate);
  });

  it("produces output that passes the Zod validation schema", () => {
    const result = mockExtractTenderCandidate(opportunityResult(), context);
    expect(TenderCandidateSchema.safeParse(result).success).toBe(true);
  });

  it("classifies a title with both buyer-portal and explicit-opportunity language as BOTH", () => {
    const result = mockExtractTenderCandidate(
      opportunityResult({ title: "Procurement Portal | RFQ for Stainless Steel Pipes" }),
      context,
    );
    expect(result.extractionType).toBe("BOTH");
  });
});
