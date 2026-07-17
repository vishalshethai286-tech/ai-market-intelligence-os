import * as z from "zod";

export const TargetCompanySchema = z.object({
  companyName: z.string().trim().min(1, { error: "Company name is required." }).max(200),
  website: z.string().trim().max(500),
  country: z.string().trim().max(100),
  cityState: z.string().trim().max(100),
  industry: z.string().trim().max(200),
  companyDescription: z.string().trim().max(2000),
  buyerType: z.string().trim().max(100),
  matchedProduct: z.string().trim().max(200),
});

export type TargetCompanyFormState =
  | { errors?: Record<string, string[] | undefined>; message?: string }
  | undefined;
