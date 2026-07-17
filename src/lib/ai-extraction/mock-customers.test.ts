import { describe, expect, it } from "vitest";
import { mockExtractCustomerCandidate } from "./mock-customers";
import { CustomerCandidateSchema } from "@/lib/customers/schema";
import type { CustomerExtractionContext } from "@/lib/customers/prompt";
import type { RawSearchResult } from "@/models";

const context: CustomerExtractionContext = {
  companyName: "Our Company",
  industry: "Industrial Equipment",
  businessDescription: "We manufacture pumps.",
  productChoices: ["Centrifugal Pump"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["OEM", "Manufacturer"],
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
    searchType: "CUSTOMER",
    query: "industrial pump manufacturer USA",
    title: "ABC Pumps | Industrial Pump Manufacturer USA",
    snippet: "ABC Pumps has been manufacturing centrifugal pumps in the USA since 1990.",
    url: "https://abcpumps.com/about",
    domain: "abcpumps.com",
    country: "USA",
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

describe("mockExtractCustomerCandidate", () => {
  it("is deterministic — the same input always produces the same output", () => {
    const result = rawResult();
    expect(mockExtractCustomerCandidate(result, context)).toEqual(mockExtractCustomerCandidate(result, context));
  });

  it("extracts a plausible customer from a title/domain, matching the ABC Pumps example", () => {
    const result = mockExtractCustomerCandidate(rawResult(), context);
    expect(result.isRealCompany).toBe(true);
    expect(result.isTargetCustomer).toBe(true);
    expect(result.customerName).toBe("ABC Pumps");
    expect(result.country).toBe("USA");
    expect(result.website).toBe("https://abcpumps.com");
    expect(result.buyerType).toBe("Manufacturer");
    expect(result.matchedProductServiceName).toBe("Centrifugal Pump");
    expect(result.confidenceScore).toBeGreaterThan(0);
  });

  it("excludes obvious directory/social/news domains", () => {
    const result = mockExtractCustomerCandidate(
      rawResult({ domain: "www.linkedin.com", title: "ABC Pumps - LinkedIn" }),
      context,
    );
    expect(result.isTargetCustomer).toBe(false);
  });

  it("excludes a result matching our own company name", () => {
    const result = mockExtractCustomerCandidate(rawResult({ title: "Our Company | Home" }), context);
    expect(result.isTargetCustomer).toBe(false);
  });

  it("produces output that passes the Zod validation schema", () => {
    const result = mockExtractCustomerCandidate(rawResult(), context);
    expect(CustomerCandidateSchema.safeParse(result).success).toBe(true);
  });
});
