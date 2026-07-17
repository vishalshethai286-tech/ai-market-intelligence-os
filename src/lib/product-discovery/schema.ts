export const PRODUCT_SERVICE_TYPES = ["PRODUCT", "SERVICE"] as const;
export type ProductServiceExtractionType = (typeof PRODUCT_SERVICE_TYPES)[number];

/** Shape of a single extracted item, validated against buildDiscoveryJsonSchema(). */
export type ExtractedProductService = {
  name: string;
  type: ProductServiceExtractionType;
  category: string;
  subcategory: string;
  description: string;
  applications: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  keywords: string[];
  synonyms: string[];
  relatedProductsServices: string[];
  projectKeywords: string[];
  tenderKeywords: string[];
  vendorRegistrationKeywords: string[];
  sourceUrls: string[];
  confidenceScore: number;
};

/**
 * Builds the `output_config.format` JSON Schema for a discovery run.
 * `sourceUrlChoices` is the set of pages we actually fetched for this run —
 * constraining `sourceUrls` to an enum of those URLs means the model can only
 * cite a page it was actually given, never invent one.
 */
export function buildDiscoveryJsonSchema(sourceUrlChoices: string[]) {
  return {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The product or service's name, as named on the site.",
            },
            type: {
              type: "string",
              enum: ["PRODUCT", "SERVICE"],
              description: "Whether this is a physical/tangible product (PRODUCT) or a service (SERVICE).",
            },
            category: {
              type: "string",
              description:
                "Broad category, e.g. 'Industrial pumps', 'HR software', 'Freight forwarding'. Empty string if unclear.",
            },
            subcategory: {
              type: "string",
              description: "A more specific grouping within the category. Empty string if unclear.",
            },
            description: {
              type: "string",
              description: "A 1-2 sentence description of this product or service, in your own words.",
            },
            applications: {
              type: "array",
              items: { type: "string" },
              description: "Use cases or applications mentioned for this product or service.",
            },
            targetIndustries: {
              type: "array",
              items: { type: "string" },
              description: "Industries this product or service appears to be aimed at.",
            },
            buyerTypes: {
              type: "array",
              items: { type: "string" },
              description:
                "Who buys this, e.g. OEM, distributor, end consumer, government, enterprise. Empty array if unclear.",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Short search-style keywords associated with this product or service.",
            },
            synonyms: {
              type: "array",
              items: { type: "string" },
              description: "Alternate names or spellings a buyer might search for instead of the given name.",
            },
            relatedProductsServices: {
              type: "array",
              items: { type: "string" },
              description:
                "Names of other products/services (from elsewhere in this same result set) commonly bought or bundled with this one. Empty array if none.",
            },
            projectKeywords: {
              type: "array",
              items: { type: "string" },
              description:
                "Search terms for finding active projects that would need this product/service (e.g. 'pipeline installation', 'wastewater treatment plant construction'). Empty array if none come to mind.",
            },
            tenderKeywords: {
              type: "array",
              items: { type: "string" },
              description:
                "Search terms for finding public tenders/RFPs that would call for this product/service. Empty array if none come to mind.",
            },
            vendorRegistrationKeywords: {
              type: "array",
              items: { type: "string" },
              description:
                "Search terms for finding vendor/supplier registration or pre-qualification programs relevant to this product/service. Empty array if none come to mind.",
            },
            sourceUrls: {
              type: "array",
              items: { type: "string", enum: sourceUrlChoices },
              description: "Which of the provided page URLs mention this product or service.",
            },
            confidenceScore: {
              type: "number",
              description:
                "Your confidence, from 0 to 1, that this is a real, distinct product or service given the source content.",
            },
          },
          required: [
            "name",
            "type",
            "category",
            "subcategory",
            "description",
            "applications",
            "targetIndustries",
            "buyerTypes",
            "keywords",
            "synonyms",
            "relatedProductsServices",
            "projectKeywords",
            "tenderKeywords",
            "vendorRegistrationKeywords",
            "sourceUrls",
            "confidenceScore",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["products"],
    additionalProperties: false,
  } as const;
}
