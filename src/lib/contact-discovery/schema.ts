import * as z from "zod";
import { CONTACT_ROLE_CATEGORIES, CONTACT_SENIORITIES, CONTACT_SOURCE_TYPES } from "@/models";

/**
 * One publicly-sourced contact candidate. Deliberately has no strict
 * "fullName required" rule — a department/team contact (e.g. "Supplier
 * Registration Team") is just as valid a Contact as a named person, per the
 * Phase 11.5B spec. The `.refine()` below only requires that *something*
 * identifying was found (fullName, designation, or department), so a
 * completely empty candidate can't slip through.
 */
export const ContactCandidateSchema = z
  .object({
    fullName: z.string(),
    companyName: z.string(),
    companyWebsite: z.string(),
    designation: z.string(),
    department: z.string(),
    roleCategory: z.enum(CONTACT_ROLE_CATEGORIES),
    seniority: z.enum(CONTACT_SENIORITIES),
    email: z.string(),
    phoneNumber: z.string(),
    mobileNumber: z.string(),
    linkedinUrl: z.string(),
    country: z.string(),
    location: z.string(),
    sourceUrl: z.string(),
    sourceType: z.enum(CONTACT_SOURCE_TYPES),
    confidenceScore: z.number().min(0).max(1),
    aiContactExplanation: z.string(),
  })
  .refine((candidate) => Boolean(candidate.fullName || candidate.designation || candidate.department), {
    error: "A contact candidate needs at least a fullName, designation, or department.",
  });

export type ContactCandidate = z.infer<typeof ContactCandidateSchema>;

/**
 * Shape of a single RawSearchResult's public-contact assessment. One result
 * can plausibly name several contacts (e.g. a "Management Team" page listing
 * multiple people, or a page that names both a person and a department
 * contact) — unlike every other Phase 10/11 extractor, this one returns an
 * array.
 */
export const PublicContactExtractionSchema = z.object({
  isRelevant: z.boolean(),
  contacts: z.array(ContactCandidateSchema),
});

export type PublicContactExtraction = z.infer<typeof PublicContactExtractionSchema>;
