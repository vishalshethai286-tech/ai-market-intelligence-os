import type { SearchQueryCategory } from "@/models";

export const QUERY_GENERATOR_MODEL = "claude-opus-4-8";
export const QUERY_GENERATOR_MAX_TOKENS = 8192;

/** Non-aggressive cap on how many queries the model returns per category per run. */
export const MAX_QUERIES_PER_CATEGORY = 5;

/**
 * The 7 categories this generator produces, each with the JSON key Claude
 * returns it under, the `SearchQueryCategory` enum value it's stored as, and
 * a description used both in the prompt and the JSON Schema so the model
 * knows exactly what each category means.
 */
export const QUERY_CATEGORIES: {
  key: string;
  category: SearchQueryCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "targetCustomers",
    category: "TARGET_CUSTOMER",
    label: "Target customers",
    description:
      "General prospecting queries to find organizations that would plausibly want to buy from this company, combining its industry, products, and buyer types.",
  },
  {
    key: "buyerTypes",
    category: "BUYER_TYPE",
    label: "Buyer types",
    description: "One query per distinct buyer type given (e.g. OEM, distributor), to find that kind of buyer.",
  },
  {
    key: "industryCompanies",
    category: "INDUSTRY_COMPANY",
    label: "Industry-specific companies",
    description: "One query per target industry given, to find companies operating in that industry.",
  },
  {
    key: "productServiceBuyers",
    category: "PRODUCT_SERVICE_BUYER",
    label: "Product/service buyers",
    description: "One query per product/service given, to find companies looking to purchase that specific item.",
  },
  {
    key: "countrySpecific",
    category: "COUNTRY_SPECIFIC",
    label: "Country-specific searches",
    description:
      "One query per country served, combining the country with the company's industry/products to find prospects located there.",
  },
  {
    key: "vendorRegistration",
    category: "VENDOR_REGISTRATION",
    label: "Vendor registration pages",
    description:
      "Queries to find vendor/supplier registration or procurement portals this company could register with, relevant to its industries or countries served.",
  },
  {
    key: "projects",
    category: "PROJECT",
    label: "Projects",
    description:
      "Queries to find active or upcoming projects, tenders, or RFPs relevant to this company's products or industries.",
  },
];
