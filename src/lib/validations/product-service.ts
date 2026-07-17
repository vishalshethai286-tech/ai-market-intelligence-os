import * as z from "zod";
import { toList } from "./shared";

export { toList };

export const ProductServiceSchema = z.object({
  name: z.string().trim().min(1, { error: "Name is required." }).max(200),
  type: z.enum(["PRODUCT", "SERVICE"], { error: "Select product or service." }),
  category: z.string().trim().max(200),
  subcategory: z.string().trim().max(200),
  description: z.string().trim().max(2000),
  applications: z.array(z.string().trim().max(200)).max(50),
  targetIndustries: z.array(z.string().trim().max(100)).max(50),
  buyerTypes: z.array(z.string().trim().max(100)).max(50),
  keywords: z.array(z.string().trim().max(100)).max(50),
  synonyms: z.array(z.string().trim().max(100)).max(50),
  relatedProductsServices: z.array(z.string().trim().max(200)).max(50),
  projectKeywords: z.array(z.string().trim().max(100)).max(50),
  tenderKeywords: z.array(z.string().trim().max(100)).max(50),
  vendorRegistrationKeywords: z.array(z.string().trim().max(100)).max(50),
});

export type ProductServiceFormState =
  | { errors?: Record<string, string[] | undefined>; message?: string }
  | undefined;
