import * as z from "zod";
import { CUSTOMER_TYPES, TARGET_COUNTRIES } from "@/config/onboarding";

const COUNTRY_CODES = TARGET_COUNTRIES.map((c) => c.code);
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
  workEmail: z.email({ error: "Enter a valid work email." }).trim().toLowerCase(),
});

export const CountriesSchema = z.object({
  targetCountries: z
    .array(z.enum(COUNTRY_CODES as [string, ...string[]]))
    .min(1, { error: "Select at least one country." }),
});

export const CustomerTypesSchema = z.object({
  customerTypes: z
    .array(z.enum(CUSTOMER_TYPE_CODES as [string, ...string[]]))
    .min(1, { error: "Select at least one customer type." }),
});

export type WebsiteFormState = { errors?: { companyWebsite?: string[] }; message?: string } | undefined;
export type WorkEmailFormState = { errors?: { workEmail?: string[] }; message?: string } | undefined;
export type CountriesFormState = { errors?: { targetCountries?: string[] }; message?: string } | undefined;
export type CustomerTypesFormState = { errors?: { customerTypes?: string[] }; message?: string } | undefined;
