import * as z from "zod";
import { CUSTOMER_TYPES, TARGET_COUNTRIES, WORLDWIDE_CODE } from "@/config/onboarding";

const COUNTRY_CODES = [...TARGET_COUNTRIES.map((c) => c.code), WORLDWIDE_CODE];
const CUSTOMER_TYPE_CODES = CUSTOMER_TYPES.map((c) => c.code);

/** Accepts bare domains ("acme.com") as well as full URLs. */
export const WebsiteSchema = z.object({
  companyWebsite: z
    .string()
    .trim()
    .min(3, { error: "Enter your company website." })
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.url({ error: "Enter a valid website, e.g. acme.com" })),
});

export const WorkEmailSchema = z.object({
  // Trim/lowercase before validating format — a raw z.email().trim() would
  // reject a value with incidental leading/trailing whitespace, since the
  // format check runs before the trim in declaration order.
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid work email." })),
});

/** Optional per the Phase 3 spec — a workspace can finish onboarding with no countries selected. */
export const CountriesSchema = z.object({
  targetCountries: z.array(z.enum(COUNTRY_CODES as [string, ...string[]])),
});

/** Optional per the Phase 3 spec — a workspace can finish onboarding with no customer types selected. */
export const CustomerTypesSchema = z.object({
  customerTypes: z.array(z.enum(CUSTOMER_TYPE_CODES as [string, ...string[]])),
});

export type WebsiteFormState = { errors?: { companyWebsite?: string[] }; message?: string } | undefined;
export type WorkEmailFormState = { errors?: { workEmail?: string[] }; message?: string } | undefined;
export type CountriesFormState = { errors?: { targetCountries?: string[] }; message?: string } | undefined;
export type CustomerTypesFormState = { errors?: { customerTypes?: string[] }; message?: string } | undefined;
