import * as z from "zod";
import { toList } from "./shared";
import { CONTACT_STATUSES, CONTACT_SOURCE_TYPES, CONTACT_ROLE_CATEGORIES, CONTACT_SENIORITIES } from "@/models";

export { toList };

/** Empty string means "let the system infer this from the designation" — see contacts/service.ts's createContact/updateContact. */
export const ContactFormSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Full name is required." }).max(200),
  companyName: z.string().trim().max(200),
  companyWebsite: z.string().trim().max(300),
  designation: z.string().trim().max(200),
  department: z.string().trim().max(200),
  roleCategory: z.union([z.enum(CONTACT_ROLE_CATEGORIES), z.literal("")]),
  seniority: z.union([z.enum(CONTACT_SENIORITIES), z.literal("")]),
  email: z.union([z.email({ error: "Enter a valid email." }), z.literal("")]),
  phoneNumber: z.string().trim().max(50),
  mobileNumber: z.string().trim().max(50),
  linkedinUrl: z.string().trim().max(300),
  country: z.string().trim().max(100),
  location: z.string().trim().max(200),
  status: z.enum(CONTACT_STATUSES),
  notes: z.string().trim().max(4000),
  tags: z.array(z.string().trim().max(50)).max(30),
  sourceUrl: z.string().trim().max(500),
  sourceType: z.enum(CONTACT_SOURCE_TYPES),
});

export type ContactFormState =
  | { errors?: Record<string, string[] | undefined>; message?: string; contactId?: string }
  | undefined;
