import * as z from "zod";
import { OPERATION_TYPES } from "@/lib/company-profile/constants";
import { toList } from "./shared";

export { toList };

export const CompanyProfileSchema = z.object({
  companyName: z.string().trim().max(200),
  businessDescription: z.string().trim().max(2000),
  industry: z.string().trim().max(200),
  businessModel: z.string().trim().max(200),
  countriesServed: z.array(z.string().trim().max(100)).max(50),
  headquarters: z.string().trim().max(200),
  operationType: z.enum(OPERATION_TYPES, { error: "Select a valid operation type." }),
  certifications: z.array(z.string().trim().max(100)).max(50),
  keyProductsServices: z.array(z.string().trim().max(200)).max(50),
});

export type CompanyProfileFormState =
  | { errors?: Record<string, string[] | undefined>; message?: string }
  | undefined;
