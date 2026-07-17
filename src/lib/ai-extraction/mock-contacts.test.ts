import { describe, expect, it } from "vitest";
import { mockExtractPublicContacts } from "./mock-contacts";
import type { ContactExtractionContext } from "@/lib/contact-discovery/prompt";
import type { RawSearchResult } from "@/models";

const baseContext: ContactExtractionContext = { companyName: "", companyWebsite: "", country: "" };

function makeResult(overrides: Partial<RawSearchResult> = {}): RawSearchResult {
  return {
    id: "raw-1",
    workspaceId: "ws-1",
    discoveryRunId: "run-1",
    discoveryRunItemId: "item-1",
    searchQueryId: "query-1",
    searchQueueItemId: "queue-1",
    searchType: "CONTACT",
    query: "ADNOC supplier registration contact",
    title: "Supplier Registration Contact | ADNOC",
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

describe("mockExtractPublicContacts", () => {
  it("worked example: 'Supplier Registration Contact | ADNOC' extracts a department/team contact", () => {
    const result = makeResult();
    const extraction = mockExtractPublicContacts(result, { ...baseContext, companyName: "ADNOC" });

    expect(extraction.isRelevant).toBe(true);
    expect(extraction.contacts).toHaveLength(1);
    const contact = extraction.contacts[0];
    expect(contact.fullName).toBe("Supplier Registration Team");
    expect(contact.companyName).toBe("ADNOC");
    expect(contact.designation).toBe("Supplier Registration Contact");
    expect(contact.department).toBe("Procurement");
    expect(contact.roleCategory).toBe("VENDOR_MANAGEMENT");
    expect(contact.seniority).toBe("UNKNOWN");
    expect(contact.sourceType).toBe("SUPPLIER_PORTAL");
    expect(contact.email).toBe("");
    expect(contact.linkedinUrl).toBe("");
  });

  it("worked example: 'Jane Smith, Procurement Manager | ABC Pumps' extracts a named contact", () => {
    const result = makeResult({
      title: "Jane Smith, Procurement Manager | ABC Pumps",
      snippet: "Meet our procurement leadership team.",
      url: "https://abcpumps.example.com/team",
      domain: "abcpumps.example.com",
    });
    const extraction = mockExtractPublicContacts(result, baseContext);

    expect(extraction.isRelevant).toBe(true);
    expect(extraction.contacts).toHaveLength(1);
    const contact = extraction.contacts[0];
    expect(contact.fullName).toBe("Jane Smith");
    expect(contact.designation).toBe("Procurement Manager");
    expect(contact.roleCategory).toBe("PROCUREMENT");
    expect(contact.seniority).toBe("MANAGER");
    expect(contact.companyName).toBe("ABC Pumps");
  });

  it("extracts multiple contacts from a single raw result (named + department)", () => {
    const result = makeResult({
      title: "Management Team | Industrial Pumps Inc.",
      snippet: "Contact John Doe, Plant Manager, or reach our Supplier Registration Team for vendor onboarding inquiries.",
      url: "https://industrialpumps.example.com/team",
      domain: "industrialpumps.example.com",
    });
    const extraction = mockExtractPublicContacts(result, baseContext);

    expect(extraction.isRelevant).toBe(true);
    expect(extraction.contacts.length).toBeGreaterThanOrEqual(2);
    expect(extraction.contacts.some((c) => c.fullName === "John Doe" && c.roleCategory === "PLANT_OPERATIONS")).toBe(true);
    expect(extraction.contacts.some((c) => c.fullName === "Supplier Registration Team")).toBe(true);
  });

  it("does not invent an email, phone, or LinkedIn URL when none is present in the text", () => {
    const result = makeResult({ title: "Jane Smith, Procurement Manager | ABC Pumps", snippet: "" });
    const extraction = mockExtractPublicContacts(result, baseContext);
    for (const contact of extraction.contacts) {
      expect(contact.email).toBe("");
      expect(contact.phoneNumber).toBe("");
      expect(contact.linkedinUrl).toBe("");
    }
  });

  it("pulls a literal email/phone/LinkedIn URL out of the text when present, without guessing", () => {
    const result = makeResult({
      title: "Jane Smith, Procurement Manager | ABC Pumps",
      snippet: "Email jane.smith@abcpumps.example.com or call +1 555 234 5678. Profile: https://www.linkedin.com/in/jane-smith-procurement",
    });
    const extraction = mockExtractPublicContacts(result, baseContext);
    const contact = extraction.contacts[0];
    expect(contact.email).toBe("jane.smith@abcpumps.example.com");
    expect(contact.phoneNumber).toContain("555");
    expect(contact.linkedinUrl).toBe("https://www.linkedin.com/in/jane-smith-procurement");
  });

  it("excludes LinkedIn and other directory/social domains regardless of content", () => {
    const result = makeResult({ domain: "www.linkedin.com", url: "https://www.linkedin.com/company/adnoc" });
    const extraction = mockExtractPublicContacts(result, baseContext);
    expect(extraction.isRelevant).toBe(false);
    expect(extraction.contacts).toEqual([]);
  });

  it("is not relevant when there's no contact signal at all", () => {
    const result = makeResult({ title: "Annual Report 2026 | ADNOC", snippet: "Financial highlights for the year." });
    const extraction = mockExtractPublicContacts(result, baseContext);
    expect(extraction.isRelevant).toBe(false);
    expect(extraction.contacts).toEqual([]);
  });

  it("produces deterministic output across repeated calls with the same input", () => {
    const result = makeResult();
    const a = mockExtractPublicContacts(result, baseContext);
    const b = mockExtractPublicContacts(result, baseContext);
    expect(a).toEqual(b);
  });

  it("is validated by PublicContactExtractionSchema", async () => {
    const { PublicContactExtractionSchema } = await import("@/lib/contact-discovery/schema");
    const result = makeResult();
    const extraction = mockExtractPublicContacts(result, { ...baseContext, companyName: "ADNOC" });
    expect(PublicContactExtractionSchema.safeParse(extraction).success).toBe(true);
  });
});
