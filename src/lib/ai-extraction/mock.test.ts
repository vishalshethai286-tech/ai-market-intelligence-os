import { describe, expect, it } from "vitest";
import { mockExtractCompanyProfile } from "./mock-company-profile";
import { mockExtractProductServices } from "./mock-product-discovery";
import { CompanyProfileExtractionSchema, ProductServiceExtractionSchema } from "./zod-schemas";
import { isMockAIEnabled } from "./env";

describe("isMockAIEnabled", () => {
  it("is true when ENABLE_MOCK_AI is 'true', regardless of ANTHROPIC_API_KEY", () => {
    const prevMock = process.env.ENABLE_MOCK_AI;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.ENABLE_MOCK_AI = "true";
    process.env.ANTHROPIC_API_KEY = "sk-real-key";
    try {
      expect(isMockAIEnabled()).toBe(true);
    } finally {
      if (prevMock === undefined) delete process.env.ENABLE_MOCK_AI;
      else process.env.ENABLE_MOCK_AI = prevMock;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it("is true when no ANTHROPIC_API_KEY is configured, even without ENABLE_MOCK_AI set", () => {
    const prevMock = process.env.ENABLE_MOCK_AI;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_MOCK_AI;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(isMockAIEnabled()).toBe(true);
    } finally {
      if (prevMock === undefined) delete process.env.ENABLE_MOCK_AI;
      else process.env.ENABLE_MOCK_AI = prevMock;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it("is false when a key is configured and mock mode isn't explicitly enabled", () => {
    const prevMock = process.env.ENABLE_MOCK_AI;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ENABLE_MOCK_AI;
    process.env.ANTHROPIC_API_KEY = "sk-real-key";
    try {
      expect(isMockAIEnabled()).toBe(false);
    } finally {
      if (prevMock === undefined) delete process.env.ENABLE_MOCK_AI;
      else process.env.ENABLE_MOCK_AI = prevMock;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});

describe("mockExtractCompanyProfile", () => {
  const input = {
    url: "https://acme.com",
    title: "Acme Pumps | Home",
    metaDescription: "Industrial pump manufacturer.",
    headings: { h1: ["Welcome"], h2: ["Centrifugal Pumps", "Valves"], h3: [] },
    visibleText: "Acme makes industrial pumps and valves for the oil and gas industry.",
  };

  it("is deterministic — the same input always produces the same output", () => {
    expect(mockExtractCompanyProfile(input)).toEqual(mockExtractCompanyProfile(input));
  });

  it("derives companyName from the title, stripping a trailing '| Site' suffix", () => {
    expect(mockExtractCompanyProfile(input).companyName).toBe("Acme Pumps");
  });

  it("falls back to the hostname when there's no title", () => {
    const result = mockExtractCompanyProfile({ ...input, title: null });
    expect(result.companyName).toBe("acme.com");
  });

  it("uses the meta description as the business description when present", () => {
    expect(mockExtractCompanyProfile(input).businessDescription).toBe("Industrial pump manufacturer.");
  });

  it("makes no network call and produces output that passes the Zod validation schema", () => {
    const result = mockExtractCompanyProfile(input);
    expect(CompanyProfileExtractionSchema.safeParse(result).success).toBe(true);
  });
});

describe("mockExtractProductServices", () => {
  const pages = [
    { url: "https://acme.com", title: "Acme Pumps | Home", text: "homepage text" },
    { url: "https://acme.com/products", title: "Centrifugal Pumps", text: "product page text" },
    { url: "https://acme.com/services", title: "Installation Services", text: "service page text" },
  ];

  it("is deterministic — the same input always produces the same output", () => {
    expect(mockExtractProductServices(pages)).toEqual(mockExtractProductServices(pages));
  });

  it("skips the homepage (first page) and emits one entry per remaining page", () => {
    const result = mockExtractProductServices(pages);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["Centrifugal Pumps", "Installation Services"]);
  });

  it("guesses SERVICE for a name containing a service-y hint, PRODUCT otherwise", () => {
    const result = mockExtractProductServices(pages);
    expect(result.find((r) => r.name === "Centrifugal Pumps")?.type).toBe("PRODUCT");
    expect(result.find((r) => r.name === "Installation Services")?.type).toBe("SERVICE");
  });

  it("produces output that passes the Zod validation schema", () => {
    const result = mockExtractProductServices(pages);
    expect(ProductServiceExtractionSchema.safeParse(result).success).toBe(true);
  });
});
