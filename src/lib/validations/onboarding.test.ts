import { describe, expect, it } from "vitest";
import { CountriesSchema, CustomerTypesSchema, WebsiteSchema, WorkEmailSchema } from "./onboarding";
import { WORLDWIDE_CODE } from "@/config/onboarding";

describe("WebsiteSchema (URL normalization)", () => {
  it("prefixes a bare domain with https://", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "acme.com" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.companyWebsite).toBe("https://acme.com");
  });

  it("leaves an https:// URL untouched", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "https://acme.com/about" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.companyWebsite).toBe("https://acme.com/about");
  });

  it("prefixes rather than duplicates an http:// URL's scheme", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "http://acme.com" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.companyWebsite).toBe("http://acme.com");
  });

  it("trims surrounding whitespace before normalizing", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "  acme.com  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.companyWebsite).toBe("https://acme.com");
  });

  it("rejects a string that isn't a valid URL even after normalization", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "not a url" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = WebsiteSchema.safeParse({ companyWebsite: "" });
    expect(result.success).toBe(false);
  });
});

describe("WorkEmailSchema", () => {
  it("lowercases and trims a valid email", () => {
    const result = WorkEmailSchema.safeParse({ workEmail: "  Person@Acme.com  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.workEmail).toBe("person@acme.com");
  });

  it("rejects an invalid email", () => {
    expect(WorkEmailSchema.safeParse({ workEmail: "not-an-email" }).success).toBe(false);
  });
});

describe("CountriesSchema (optional target countries)", () => {
  it("accepts an empty selection — target countries are optional", () => {
    expect(CountriesSchema.safeParse({ targetCountries: [] }).success).toBe(true);
  });

  it("accepts a specific country code", () => {
    expect(CountriesSchema.safeParse({ targetCountries: ["US"] }).success).toBe(true);
  });

  it("accepts the WORLDWIDE sentinel", () => {
    expect(CountriesSchema.safeParse({ targetCountries: [WORLDWIDE_CODE] }).success).toBe(true);
  });

  it("rejects a code that isn't a known country or WORLDWIDE", () => {
    expect(CountriesSchema.safeParse({ targetCountries: ["NOT_A_COUNTRY"] }).success).toBe(false);
  });
});

describe("CustomerTypesSchema (optional preferred customer types)", () => {
  it("accepts an empty selection — customer types are optional", () => {
    expect(CustomerTypesSchema.safeParse({ customerTypes: [] }).success).toBe(true);
  });

  it("accepts a known customer type code", () => {
    expect(CustomerTypesSchema.safeParse({ customerTypes: ["MANUFACTURERS", "OEMS"] }).success).toBe(true);
  });

  it("rejects an unknown customer type code", () => {
    expect(CustomerTypesSchema.safeParse({ customerTypes: ["NOT_A_TYPE"] }).success).toBe(false);
  });
});
