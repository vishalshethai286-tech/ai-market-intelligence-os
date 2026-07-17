import { describe, expect, it } from "vitest";
import { mockExtractVendorRegistrationCandidate } from "./mock-vendor-registrations";
import type { VendorRegistrationExtractionContext } from "@/lib/vendor-registrations/prompt";
import type { RawSearchResult } from "@/models";

const baseContext: VendorRegistrationExtractionContext = {
  companyName: "Our Company",
  industry: "Oil & Gas",
  businessDescription: "We make pumps.",
  productChoices: ["Centrifugal Pump"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["EPC Contractor"],
  countriesServed: ["USA"],
};

function makeResult(overrides: Partial<RawSearchResult> = {}): RawSearchResult {
  return {
    id: "raw-1",
    workspaceId: "ws-1",
    discoveryRunId: "run-1",
    discoveryRunItemId: "item-1",
    searchQueryId: "query-1",
    searchQueueItemId: "queue-1",
    searchType: "VENDOR_REGISTRATION",
    query: "supplier registration UAE",
    title: "Supplier Registration | ADNOC",
    snippet: "",
    url: "https://adnoc.example.com/suppliers/register",
    domain: "adnoc.example.com",
    country: "United Arab Emirates",
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

describe("mockExtractVendorRegistrationCandidate", () => {
  it("worked example: 'Supplier Registration | ADNOC' extracts a Supplier Portal registration with required documents", () => {
    const result = makeResult({
      snippet: "Company profile, ISO certificate, trade license, and product catalog are required for supplier registration.",
    });
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);

    expect(candidate.isRelevant).toBe(true);
    expect(candidate.customerName).toBe("ADNOC");
    expect(candidate.country).toBe("United Arab Emirates");
    expect(candidate.vendorRegistrationLink).toBe(result.url);
    expect(candidate.registrationType).toBe("Supplier Portal");
    expect(candidate.requiredDocuments).toEqual(["Company profile", "ISO certificate", "Trade license", "Product catalog"]);
  });

  it("worked example: 'Become a Supplier | SABIC' extracts a Vendor Onboarding registration", () => {
    const result = makeResult({
      title: "Become a Supplier | SABIC",
      snippet: "SABIC invites qualified suppliers to join our vendor network.",
      url: "https://sabic.example.com/become-a-supplier",
      domain: "sabic.example.com",
      country: "Saudi Arabia",
    });
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);

    expect(candidate.isRelevant).toBe(true);
    expect(candidate.customerName).toBe("SABIC");
    expect(candidate.country).toBe("Saudi Arabia");
    expect(candidate.vendorRegistrationLink).toBe(result.url);
    expect(candidate.registrationType).toBe("Vendor Onboarding");
  });

  it("excludes directory/social domains regardless of content", () => {
    const result = makeResult({ domain: "www.linkedin.com", url: "https://www.linkedin.com/company/adnoc" });
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);
    expect(candidate.isRelevant).toBe(false);
  });

  it("excludes our own company's page", () => {
    const result = makeResult({ title: "Supplier Registration | Our Company" });
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);
    expect(candidate.isRelevant).toBe(false);
  });

  it("is not relevant when there's no vendor/supplier/procurement signal at all", () => {
    const result = makeResult({ title: "Annual Report 2026 | ADNOC", snippet: "Financial highlights for the year." });
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);
    expect(candidate.isRelevant).toBe(false);
  });

  it("produces deterministic output across repeated calls with the same input", () => {
    const result = makeResult();
    const a = mockExtractVendorRegistrationCandidate(result, baseContext);
    const b = mockExtractVendorRegistrationCandidate(result, baseContext);
    expect(a).toEqual(b);
  });

  it("is validated by VendorRegistrationCandidateSchema", async () => {
    const { VendorRegistrationCandidateSchema } = await import("@/lib/vendor-registrations/schema");
    const result = makeResult();
    const candidate = mockExtractVendorRegistrationCandidate(result, baseContext);
    expect(VendorRegistrationCandidateSchema.safeParse(candidate).success).toBe(true);
  });
});
