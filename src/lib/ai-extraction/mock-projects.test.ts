import { describe, expect, it } from "vitest";
import { mockExtractProjectCandidate } from "./mock-projects";
import { ProjectCandidateSchema } from "@/lib/projects/schema";
import type { ProjectExtractionContext } from "@/lib/projects/prompt";
import type { RawSearchResult } from "@/models";

const context: ProjectExtractionContext = {
  companyName: "Our Company",
  industry: "Industrial Equipment",
  businessDescription: "We manufacture pumps.",
  productChoices: ["Centrifugal Pump"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["EPC Contractor"],
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
    searchType: "PROJECT",
    query: "oil & gas EPC award USA",
    title: "Acme Refining | New Refinery Expansion Announced in Texas",
    snippet: "Acme Refining announced a new refinery expansion project in Texas, awarded to BuildCo EPC, expected completion 2027.",
    url: "https://acmerefining.example.com/news/expansion",
    domain: "acmerefining.example.com",
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

describe("mockExtractProjectCandidate", () => {
  it("is deterministic — the same input always produces the same output", () => {
    const result = rawResult();
    expect(mockExtractProjectCandidate(result, context)).toEqual(mockExtractProjectCandidate(result, context));
  });

  it("extracts a plausible project from a title/snippet", () => {
    const result = mockExtractProjectCandidate(rawResult(), context);
    expect(result.isRelevant).toBe(true);
    expect(result.clientName).toBe("Acme Refining");
    expect(result.country).toBe("USA");
    expect(result.projectInformationLink).toBe("https://acmerefining.example.com/news/expansion");
    expect(result.contractorName).toBe("BuildCo EPC");
    expect(result.timeline).toBe("2027");
    expect(result.projectStage).toBe("AWARDED");
    expect(result.matchedProductServiceName).toBe("Centrifugal Pump");
    expect(result.confidenceScore).toBeGreaterThan(0);
  });

  it("excludes obvious directory/social/news domains", () => {
    const result = mockExtractProjectCandidate(
      rawResult({ domain: "www.linkedin.com", title: "Acme Refining - LinkedIn" }),
      context,
    );
    expect(result.isRelevant).toBe(false);
  });

  it("excludes a result matching our own company name", () => {
    const result = mockExtractProjectCandidate(rawResult({ title: "Our Company | Home" }), context);
    expect(result.isRelevant).toBe(false);
  });

  it("detects a tender-stage project from keywords", () => {
    const result = mockExtractProjectCandidate(
      rawResult({ title: "Acme Refining | Refinery Upgrade Tender Published", snippet: "Tender open for bids." }),
      context,
    );
    expect(result.projectStage).toBe("TENDER");
  });

  it("produces output that passes the Zod validation schema", () => {
    const result = mockExtractProjectCandidate(rawResult(), context);
    expect(ProjectCandidateSchema.safeParse(result).success).toBe(true);
  });
});
