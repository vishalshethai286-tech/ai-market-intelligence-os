import "server-only";
import type { WebsiteAnalysis } from "@/models";
import { extractCompanyProfile } from "@/lib/company-profile/extract";
import { extractProductServices } from "@/lib/product-discovery/extract";
import { generateSearchQueries } from "@/lib/search-queries/generate";
import { extractTargetCompanies } from "@/lib/target-companies/extract";
import type { ExtractedCompanyProfile } from "@/lib/company-profile/schema";
import type { ExtractedProductService } from "@/lib/product-discovery/schema";
import type { PageContent } from "@/lib/product-discovery/types";
import type { QueryGeneratorContext } from "@/lib/search-queries/prompt";
import type { GeneratedQueriesByCategory } from "@/lib/search-queries/schema";
import type { SearchResult } from "@/lib/search";
import type { TargetExtractionContext } from "@/lib/target-companies/prompt";
import type { ExtractedTargetCompany } from "@/lib/target-companies/schema";
import type { RawSearchResult } from "@/models";
import { extractCustomerCandidate } from "@/lib/customers/extract";
import type { CustomerExtractionContext } from "@/lib/customers/prompt";
import { CustomerCandidateSchema, type CustomerCandidate } from "@/lib/customers/schema";
import { extractProjectCandidate } from "@/lib/projects/extract";
import type { ProjectExtractionContext } from "@/lib/projects/prompt";
import { ProjectCandidateSchema, type ProjectCandidate } from "@/lib/projects/schema";
import { extractTenderCandidate } from "@/lib/tenders/extract";
import type { TenderExtractionContext } from "@/lib/tenders/prompt";
import { TenderCandidateSchema, type TenderCandidate } from "@/lib/tenders/schema";
import { extractVendorRegistrationCandidate } from "@/lib/vendor-registrations/extract";
import type { VendorRegistrationExtractionContext } from "@/lib/vendor-registrations/prompt";
import { VendorRegistrationCandidateSchema, type VendorRegistrationCandidate } from "@/lib/vendor-registrations/schema";
import { extractPublicContacts } from "@/lib/contact-discovery/extract";
import type { ContactExtractionContext } from "@/lib/contact-discovery/prompt";
import { PublicContactExtractionSchema, type PublicContactExtraction } from "@/lib/contact-discovery/schema";
import { isMockAIEnabled } from "./env";
import { mockExtractCompanyProfile } from "./mock-company-profile";
import { mockExtractProductServices } from "./mock-product-discovery";
import { mockGenerateSearchQueries } from "./mock-search-queries";
import { mockExtractTargetCompanies } from "./mock-target-companies";
import { mockExtractCustomerCandidate } from "./mock-customers";
import { mockExtractProjectCandidate } from "./mock-projects";
import { mockExtractTenderCandidate } from "./mock-tenders";
import { mockExtractVendorRegistrationCandidate } from "./mock-vendor-registrations";
import { mockExtractPublicContacts } from "./mock-contacts";
import {
  CompanyProfileExtractionSchema,
  ProductServiceExtractionSchema,
  SearchQueriesExtractionSchema,
  TargetCompanyExtractionSchema,
} from "./zod-schemas";

export class AIExtractionValidationError extends Error {}

/**
 * Single entry point for both AI extraction tasks this app needs (company
 * profile, product/service catalog). Dispatches to a real model call or a
 * deterministic no-network mock depending on isMockAIEnabled(), and
 * validates whichever one ran against a Zod schema before returning —
 * catches shape drift/bugs regardless of which path produced the result.
 *
 * The real path delegates to the existing Anthropic-based extractors
 * (src/lib/company-profile/extract.ts, src/lib/product-discovery/extract.ts)
 * rather than duplicating their prompts/JSON schemas here.
 */
export async function extractCompanyProfileAI(analysis: WebsiteAnalysis): Promise<ExtractedCompanyProfile> {
  const result = isMockAIEnabled() ? mockExtractCompanyProfile(analysis) : await extractCompanyProfile(analysis);

  const validated = CompanyProfileExtractionSchema.safeParse(result);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Company profile extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

export async function extractProductServicesAI(pages: PageContent[]): Promise<ExtractedProductService[]> {
  const result = isMockAIEnabled() ? mockExtractProductServices(pages) : await extractProductServices(pages);

  const validated = ProductServiceExtractionSchema.safeParse(result);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Product/service extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/search-queries — real path delegates to generate.ts. */
export async function generateSearchQueriesAI(context: QueryGeneratorContext): Promise<GeneratedQueriesByCategory> {
  const result = isMockAIEnabled() ? mockGenerateSearchQueries(context) : await generateSearchQueries(context);

  const validated = SearchQueriesExtractionSchema.safeParse(result);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Search query generation did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/target-companies — real path delegates to extract.ts. */
export async function extractTargetCompaniesAI(
  results: SearchResult[],
  context: TargetExtractionContext,
  productChoices: string[],
): Promise<ExtractedTargetCompany[]> {
  const result = isMockAIEnabled()
    ? mockExtractTargetCompanies(results, context, productChoices)
    : await extractTargetCompanies(results, context, productChoices);

  const validated = TargetCompanyExtractionSchema.safeParse(result);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Target company extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/customers — real path delegates to extract.ts (Anthropic, not OpenAI — see PROJECT_STATUS.md's "Not OpenAI" note). */
export async function extractCustomerCandidateAI(
  result: RawSearchResult,
  context: CustomerExtractionContext,
): Promise<CustomerCandidate> {
  const candidate = isMockAIEnabled()
    ? mockExtractCustomerCandidate(result, context)
    : await extractCustomerCandidate(result, context);

  const validated = CustomerCandidateSchema.safeParse(candidate);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Customer extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/projects — real path delegates to extract.ts (Anthropic, not OpenAI — same "Not OpenAI" reasoning as extractCustomerCandidateAI). */
export async function extractProjectCandidateAI(
  result: RawSearchResult,
  context: ProjectExtractionContext,
): Promise<ProjectCandidate> {
  const candidate = isMockAIEnabled()
    ? mockExtractProjectCandidate(result, context)
    : await extractProjectCandidate(result, context);

  const validated = ProjectCandidateSchema.safeParse(candidate);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Project extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/tenders — real path delegates to extract.ts (Anthropic, not OpenAI — same "Not OpenAI" reasoning as extractCustomerCandidateAI). */
export async function extractTenderCandidateAI(
  result: RawSearchResult,
  context: TenderExtractionContext,
): Promise<TenderCandidate> {
  const candidate = isMockAIEnabled() ? mockExtractTenderCandidate(result, context) : await extractTenderCandidate(result, context);

  const validated = TenderCandidateSchema.safeParse(candidate);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Tender extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/vendor-registrations — real path delegates to extract.ts (Anthropic, not OpenAI — same "Not OpenAI" reasoning as extractCustomerCandidateAI). */
export async function extractVendorRegistrationCandidateAI(
  result: RawSearchResult,
  context: VendorRegistrationExtractionContext,
): Promise<VendorRegistrationCandidate> {
  const candidate = isMockAIEnabled()
    ? mockExtractVendorRegistrationCandidate(result, context)
    : await extractVendorRegistrationCandidate(result, context);

  const validated = VendorRegistrationCandidateSchema.safeParse(candidate);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Vendor registration extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}

/** Same mock-or-real dispatch, for src/lib/contact-discovery — real path delegates to extract.ts (Anthropic, not OpenAI — same "Not OpenAI" reasoning as extractCustomerCandidateAI). Returns zero-or-more contact candidates per result, unlike every other extractor here. */
export async function extractPublicContactsAI(
  result: RawSearchResult,
  context: ContactExtractionContext,
): Promise<PublicContactExtraction> {
  const extraction = isMockAIEnabled() ? mockExtractPublicContacts(result, context) : await extractPublicContacts(result, context);

  const validated = PublicContactExtractionSchema.safeParse(extraction);
  if (!validated.success) {
    throw new AIExtractionValidationError(
      `Public contact extraction did not match the expected shape: ${validated.error.message}`,
    );
  }
  return validated.data;
}
