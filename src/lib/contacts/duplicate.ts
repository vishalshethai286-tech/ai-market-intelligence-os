import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { Contact as ContactModel } from "@/models";
import type { Contact, ContactSourceHistoryEntry } from "@/models";
import { calculateStringSimilarity } from "@/lib/dedup/normalize";
import {
  normalizeContactName,
  normalizeEmail,
  normalizePhone,
  normalizeLinkedInUrl,
  normalizeCompanyDomain,
} from "./normalize";

/**
 * Phase 11.5A's contact deduplication is deliberately self-contained here —
 * unlike TargetCustomer/ProjectOpportunity/TenderBuyer/TenderOpportunity/
 * VendorRegistration, Contact is NOT wired into the generic DedupRecordType/
 * DuplicateRecord/MergeHistory engine (src/lib/dedup/*) in this phase. This
 * is the "basic" duplicate detection the spec asks for: same email or same
 * LinkedIn URL is a hard duplicate; same name+companyDomain is a likely
 * duplicate; same phone+companyDomain or same name+companyName+country is a
 * possible duplicate. A future phase can graduate this into the full engine
 * if/when Contact needs Duplicate Review UI support.
 */

export type DuplicateMatchType = "STRONG" | "WEAK";
export type ExistingContactMatch = { contact: Contact; matchType: DuplicateMatchType };

export type DetectExistingContactInput = {
  fullName: string;
  email: string;
  linkedinUrl: string;
  companyDomain: string;
  companyName: string;
  country: string;
  phoneNumber: string;
};

/**
 * Looks for an existing Contact that's plausibly the same real-world
 * person, checked strongest-signal-first: same email or same LinkedIn URL
 * is STRONG (the caller should update, not create a new row); same
 * fullName+companyDomain is also treated as STRONG (a likely duplicate per
 * the spec's own wording); same phoneNumber+companyDomain or same
 * fullName+companyName+country is WEAK (possible duplicate — still worth
 * creating a new row for a human to resolve, just flagged).
 */
export async function detectExistingContact(workspaceId: string, input: DetectExistingContactInput): Promise<ExistingContactMatch | null> {
  await dbConnect();

  const email = normalizeEmail(input.email);
  const linkedinUrl = normalizeLinkedInUrl(input.linkedinUrl);
  const companyDomain = normalizeCompanyDomain(input.companyDomain);
  const normalizedName = normalizeContactName(input.fullName);

  if (email) {
    const candidates = await ContactModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" }, email: { $ne: null } });
    const strongMatch = candidates.find((c) => normalizeEmail(c.email ?? "") === email);
    if (strongMatch) return { contact: strongMatch.toObject() as Contact, matchType: "STRONG" };
  }

  if (linkedinUrl) {
    const candidates = await ContactModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" }, linkedinUrl: { $ne: null } });
    const strongMatch = candidates.find((c) => normalizeLinkedInUrl(c.linkedinUrl ?? "") === linkedinUrl);
    if (strongMatch) return { contact: strongMatch.toObject() as Contact, matchType: "STRONG" };
  }

  if (normalizedName && companyDomain) {
    const candidates = await ContactModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" }, companyDomain });
    const strongMatch = candidates.find((c) => normalizeContactName(c.fullName) === normalizedName);
    if (strongMatch) return { contact: strongMatch.toObject() as Contact, matchType: "STRONG" };
  }

  const normalizedPhone = normalizePhone(input.phoneNumber);
  if (normalizedPhone && companyDomain) {
    const candidates = await ContactModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" }, companyDomain });
    const weakMatch = candidates.find((c) => normalizePhone(c.phoneNumber ?? "") === normalizedPhone);
    if (weakMatch) return { contact: weakMatch.toObject() as Contact, matchType: "WEAK" };
  }

  if (normalizedName && input.companyName && input.country) {
    const candidates = await ContactModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" }, companyName: input.companyName, country: input.country });
    const weakMatch = candidates.find((c) => normalizeContactName(c.fullName) === normalizedName);
    if (weakMatch) return { contact: weakMatch.toObject() as Contact, matchType: "WEAK" };
  }

  return null;
}

export type ContactDuplicateCandidate = {
  fullName: string;
  companyName: string;
  companyDomain: string;
  country: string;
  email: string;
  linkedinUrl: string;
  phoneNumber: string;
};

export type ContactDuplicateScoreResult = {
  score: number;
  matchingFields: string[];
  conflictingFields: string[];
  reason: string;
};

/**
 * 0-100 fuzzy duplicate score for two Contact candidates — same shape as
 * the generic dedup scorers in src/lib/dedup/scoring.ts, kept local to this
 * module since Contact isn't wired into that generic engine (see module
 * docblock above). Same email or same LinkedIn URL is conclusive on its
 * own; same name+companyDomain is a strong-but-not-conclusive signal.
 */
export function calculateContactDuplicateScore(a: ContactDuplicateCandidate, b: ContactDuplicateCandidate): ContactDuplicateScoreResult {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  const emailMatch = Boolean(emailA && emailB && emailA === emailB);

  const linkedinA = normalizeLinkedInUrl(a.linkedinUrl);
  const linkedinB = normalizeLinkedInUrl(b.linkedinUrl);
  const linkedinMatch = Boolean(linkedinA && linkedinB && linkedinA === linkedinB);

  const nameSimilarity = calculateStringSimilarity(normalizeContactName(a.fullName), normalizeContactName(b.fullName));
  const domainA = normalizeCompanyDomain(a.companyDomain);
  const domainB = normalizeCompanyDomain(b.companyDomain);
  const domainMatch = Boolean(domainA && domainB && domainA === domainB);
  const countryMatch = Boolean(a.country && b.country && a.country.trim().toLowerCase() === b.country.trim().toLowerCase());
  const phoneMatch = Boolean(normalizePhone(a.phoneNumber) && normalizePhone(a.phoneNumber) === normalizePhone(b.phoneNumber));
  const companyNameMatch = Boolean(a.companyName && b.companyName && a.companyName.trim().toLowerCase() === b.companyName.trim().toLowerCase());

  let score = (emailMatch ? 40 : 0) + (linkedinMatch ? 30 : 0) + nameSimilarity * 20 + (domainMatch ? 5 : 0) + (phoneMatch ? 5 : 0);

  const matchingFields: string[] = [];
  const conflictingFields: string[] = [];

  if (emailMatch) matchingFields.push("email");
  else if (emailA && emailB) conflictingFields.push("email");

  if (linkedinMatch) matchingFields.push("linkedinUrl");
  else if (linkedinA && linkedinB) conflictingFields.push("linkedinUrl");

  if (nameSimilarity >= 0.9) matchingFields.push("fullName");
  else if (a.fullName && b.fullName && nameSimilarity < 0.5) conflictingFields.push("fullName");

  if (domainMatch) matchingFields.push("companyDomain");
  if (phoneMatch) matchingFields.push("phoneNumber");
  if (companyNameMatch) matchingFields.push("companyName");
  if (countryMatch) matchingFields.push("country");

  // Same email or same LinkedIn URL is conclusive on its own.
  if (emailMatch) score = Math.max(score, 96);
  if (linkedinMatch) score = Math.max(score, 96);
  // Same name + company domain is a likely duplicate per the spec's own wording — strong, not quite conclusive.
  if (nameSimilarity >= 0.95 && domainMatch) score = Math.max(score, 90);
  // Same phone+domain, or same name+company+country, are each a possible-duplicate signal.
  if (phoneMatch && domainMatch) score = Math.max(score, 78);
  if (nameSimilarity >= 0.9 && companyNameMatch && countryMatch) score = Math.max(score, 78);

  score = Math.min(100, Math.round(score));

  const reason = matchingFields.length > 0 ? `Matches on ${matchingFields.join(", ")}` : "No strong matching fields";
  return { score, matchingFields, conflictingFields, reason };
}

/** Fields copied from incoming data onto the existing contact only when the existing value is empty — never overwrites a real value with another real value, mirroring the generic dedup engine's fill-if-empty rule. */
const FILL_IF_EMPTY_FIELDS = [
  "firstName",
  "lastName",
  "companyName",
  "companyWebsite",
  "companyDomain",
  "designation",
  "department",
  "email",
  "phoneNumber",
  "mobileNumber",
  "linkedinUrl",
  "country",
  "location",
  "notes",
] as const;

/**
 * Fills any empty field on an existing Contact document with a non-empty
 * value from incoming data, without ever overwriting a real existing value.
 * Caller is responsible for calling `.save()` afterward. Returns the list of
 * field names that were actually changed, for logging/testing.
 */
export function updateExistingContactWithBetterData(
  existingContact: { get: (field: string) => unknown; set: (field: string, value: unknown) => void },
  incoming: Record<string, unknown>,
): string[] {
  const updatedFields: string[] = [];
  for (const field of FILL_IF_EMPTY_FIELDS) {
    const existingValue = existingContact.get(field);
    const incomingValue = incoming[field];
    if (!existingValue && incomingValue) {
      existingContact.set(field, incomingValue);
      updatedFields.push(field);
    }
  }
  return updatedFields;
}

/** Appends a new source-history entry to an existing list, skipping an exact duplicate (same url+sourceType) so re-confirming the same source doesn't grow the list forever. */
export function preserveContactSourceHistory(
  existingSourceHistory: ContactSourceHistoryEntry[],
  newEntry: ContactSourceHistoryEntry,
): ContactSourceHistoryEntry[] {
  const alreadyPresent = existingSourceHistory.some((entry) => entry.url === newEntry.url && entry.sourceType === newEntry.sourceType);
  if (alreadyPresent) return existingSourceHistory;
  return [...existingSourceHistory, newEntry];
}
