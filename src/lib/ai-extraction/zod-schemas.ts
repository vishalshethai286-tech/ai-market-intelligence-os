import * as z from "zod";
import { OPERATION_TYPES } from "@/lib/company-profile/constants";
import { PRODUCT_SERVICE_TYPES } from "@/lib/product-discovery/schema";

/**
 * Validates the shape of a company-profile extraction result — from either
 * the mock extractor or the real one — before it reaches the database.
 * Structured outputs already guarantee Claude's response matches
 * EXTRACTION_JSON_SCHEMA, but validating again here catches drift between
 * that JSON Schema and this type, and covers the mock path (which has no
 * such guarantee at all).
 */
export const CompanyProfileExtractionSchema = z.object({
  companyName: z.string(),
  businessDescription: z.string(),
  industry: z.string(),
  businessModel: z.string(),
  countriesServed: z.array(z.string()),
  headquarters: z.string(),
  operationType: z.enum(OPERATION_TYPES),
  certifications: z.array(z.string()),
  keyProductsServices: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1),
});

const ProductServiceExtractionItemSchema = z.object({
  name: z.string(),
  type: z.enum(PRODUCT_SERVICE_TYPES),
  category: z.string(),
  subcategory: z.string(),
  description: z.string(),
  applications: z.array(z.string()),
  targetIndustries: z.array(z.string()),
  buyerTypes: z.array(z.string()),
  keywords: z.array(z.string()),
  synonyms: z.array(z.string()),
  relatedProductsServices: z.array(z.string()),
  projectKeywords: z.array(z.string()),
  tenderKeywords: z.array(z.string()),
  vendorRegistrationKeywords: z.array(z.string()),
  sourceUrls: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1),
});

export const ProductServiceExtractionSchema = z.array(ProductServiceExtractionItemSchema);

const GeneratedQuerySchema = z.object({
  query: z.string(),
  basedOn: z.string(),
});

/** Keyed by category key (see QUERY_CATEGORIES) — validated as a record of arrays rather than fixed keys, since the category list is config-driven. */
export const SearchQueriesExtractionSchema = z.record(z.string(), z.array(GeneratedQuerySchema));

export const TargetCompanyExtractionSchema = z.array(
  z.object({
    isRelevantTarget: z.boolean(),
    companyName: z.string(),
    website: z.string(),
    industry: z.string(),
    country: z.string(),
    matchedProduct: z.string(),
    relevanceExplanation: z.string(),
    confidenceScore: z.number().min(0).max(1),
  }),
);
