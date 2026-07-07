import { OPERATION_TYPES } from "./constants";

export type OperationType = (typeof OPERATION_TYPES)[number];

/** Shape returned by the extraction model, validated against EXTRACTION_JSON_SCHEMA. */
export type ExtractedCompanyProfile = {
  companyName: string;
  businessDescription: string;
  industry: string;
  businessModel: string;
  countriesServed: string[];
  headquarters: string;
  operationType: OperationType;
  certifications: string[];
  keyProductsServices: string[];
  confidenceScore: number;
};

/**
 * JSON Schema passed to `output_config.format` so the Messages API guarantees
 * a parseable, on-shape response. Empty string / empty array is the "not
 * determinable from the source content" convention, rather than null, to
 * keep the schema simple (structured outputs don't support nullable types
 * well and don't support additionalProperties other than false).
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    companyName: {
      type: "string",
      description: "The company's name. Empty string if not determinable from the content.",
    },
    businessDescription: {
      type: "string",
      description:
        "A 1-3 sentence plain-English summary of what the company does, written in your own words (not copied verbatim from the site).",
    },
    industry: {
      type: "string",
      description:
        "The industry or sector the company operates in, e.g. 'Industrial machinery', 'SaaS - HR tech', 'Specialty chemicals'. Empty string if unclear.",
    },
    businessModel: {
      type: "string",
      description:
        "e.g. B2B, B2C, B2B2C, Marketplace, Direct-to-Consumer, Wholesale distribution. Empty string if unclear.",
    },
    countriesServed: {
      type: "array",
      items: { type: "string" },
      description:
        "Countries or regions the company appears to serve, ship to, or operate in, as named or implied on the site. Empty array if none are mentioned.",
    },
    headquarters: {
      type: "string",
      description: "City and/or country of the company's headquarters, if mentioned. Empty string if not mentioned.",
    },
    operationType: {
      type: "string",
      enum: OPERATION_TYPES as unknown as string[],
      description:
        "Whether the company primarily manufactures products (MANUFACTURER), trades/distributes/resells products made by others (TRADER), provides services (SERVICE_PROVIDER), operates some other way (OTHER), or this cannot be determined (UNKNOWN).",
    },
    certifications: {
      type: "array",
      items: { type: "string" },
      description:
        "Certifications, standards, or accreditations mentioned on the site (e.g. ISO 9001, ISO 14001, CE, FDA registered). Empty array if none are mentioned.",
    },
    keyProductsServices: {
      type: "array",
      items: { type: "string" },
      description: "The main products or services the company offers, as short labels (not full sentences).",
    },
    confidenceScore: {
      type: "number",
      description:
        "Your confidence, from 0 to 1, that this extraction accurately represents the company given the source content. Use a lower score when the homepage content is sparse, generic, or ambiguous.",
    },
  },
  required: [
    "companyName",
    "businessDescription",
    "industry",
    "businessModel",
    "countriesServed",
    "headquarters",
    "operationType",
    "certifications",
    "keyProductsServices",
    "confidenceScore",
  ],
  additionalProperties: false,
} as const;
