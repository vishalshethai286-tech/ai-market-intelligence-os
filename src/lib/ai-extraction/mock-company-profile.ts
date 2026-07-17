import type { ExtractedCompanyProfile } from "@/lib/company-profile/schema";

export type MockCompanyProfileInput = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  headings: unknown;
  visibleText: string | null;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Strips a trailing "| Site Name" / "- Site Name" suffix some homepages put in <title>. */
function cleanTitle(title: string): string {
  return title.split(/\s*[|–-]\s*/)[0].trim();
}

function headingList(headings: unknown, level: "h1" | "h2"): string[] {
  if (!headings || typeof headings !== "object") return [];
  const value = (headings as Record<string, unknown>)[level];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Deterministic, no-network extraction used when AI extraction is mocked
 * (see env.ts) — same input always produces the same output. Derives what it
 * reasonably can from already-fetched page content (title, meta description,
 * headings) and leaves everything else empty/unknown rather than guessing,
 * with a low confidenceScore signaling this is a placeholder, not a real
 * extraction.
 */
export function mockExtractCompanyProfile(input: MockCompanyProfileInput): ExtractedCompanyProfile {
  const companyName = input.title ? cleanTitle(input.title) : hostnameOf(input.url);
  const businessDescription =
    input.metaDescription || (input.visibleText ? input.visibleText.slice(0, 240).trim() : "");
  const keyProductsServices = headingList(input.headings, "h2").slice(0, 5);

  return {
    companyName,
    businessDescription,
    industry: "",
    businessModel: "",
    countriesServed: [],
    headquarters: "",
    operationType: "UNKNOWN",
    certifications: [],
    keyProductsServices,
    confidenceScore: 0.2,
  };
}
