import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  Contact as ContactModel,
  ContactActivity as ContactActivityModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
} from "@/models";
import type { Contact, ContactRoleCategory } from "@/models";
import type { ContactLinkableRecordType } from "@/models";
import { SENIORITY_SCORES, SOURCE_QUALITY_SCORES } from "./scoring";

/** Which roleCategory values are most worth approaching for each related-entity type, most-relevant first (index affects rank score below). "Vendor Management" stands in for the spec's "Supplier Registration" role, since that's the roleCategory the contact-discovery mock extractor already assigns to supplier-registration contacts (see ai-extraction/mock-contacts.ts). */
export const RECOMMENDED_ROLES_BY_ENTITY: Record<ContactLinkableRecordType, readonly ContactRoleCategory[]> = {
  TARGET_CUSTOMER: ["PROCUREMENT", "PURCHASE", "SOURCING", "SUPPLY_CHAIN", "MANAGEMENT", "ENGINEERING"],
  PROJECT_OPPORTUNITY: ["PROJECT_MANAGEMENT", "ENGINEERING", "PROCUREMENT", "CONTRACTS", "OPERATIONS", "MANAGEMENT"],
  TENDER_BUYER: ["TENDERING", "CONTRACTS", "PROCUREMENT", "PURCHASE", "VENDOR_MANAGEMENT"],
  TENDER_OPPORTUNITY: ["TENDERING", "CONTRACTS", "PROCUREMENT", "PROJECT_MANAGEMENT"],
  VENDOR_REGISTRATION: ["VENDOR_MANAGEMENT", "PROCUREMENT", "CONTRACTS", "ADMINISTRATION"],
};

/** Contact.<field> to query by, per related-entity type — same mapping contacts/service.ts's RELATED_RECORD_CONFIG uses, duplicated here to avoid a circular import (service.ts will end up importing from this module in a later phase). */
const RELATED_RECORD_FIELD: Record<ContactLinkableRecordType, string> = {
  TARGET_CUSTOMER: "relatedTargetCustomerId",
  PROJECT_OPPORTUNITY: "relatedProjectOpportunityId",
  TENDER_BUYER: "relatedTenderBuyerId",
  TENDER_OPPORTUNITY: "relatedTenderOpportunityId",
  VENDOR_REGISTRATION: "relatedVendorRegistrationId",
};

const NO_CONTACT_ALERTS: Record<ContactLinkableRecordType, string> = {
  TARGET_CUSTOMER: "No procurement contact found",
  PROJECT_OPPORTUNITY: "No procurement contact found",
  TENDER_BUYER: "No tender/contact person found",
  TENDER_OPPORTUNITY: "No tender/contact person found",
  VENDOR_REGISTRATION: "No vendor registration contact found",
};

const LOW_CONFIDENCE_ALERT = "Only low-confidence contact available";

/** Fresher verification is worth more than stale/never-verified — same 3-tier bucketing the enrichment scorer uses for "recent verification", just expressed as a continuous rank contribution here. */
function verificationRecencyScore(lastVerifiedAt: Date | null): number {
  if (!lastVerifiedAt) return 20;
  const ageDays = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 100;
  if (ageDays <= 180) return 60;
  return 20;
}

export type RankedContact = {
  contact: Contact;
  rankScore: number;
  matchesRecommendedRole: boolean;
};

export type BestContactsForEntityResult = {
  contacts: RankedContact[];
  alert: string | null;
};

/**
 * Ranks every Contact linked to one related record by how good a fit they
 * are to approach for that specific entity type — role relevance (per
 * RECOMMENDED_ROLES_BY_ENTITY), seniority, the contact's own
 * priorityScore/enrichmentScore, contactability (email/phone),
 * source quality, verification recency, and recent activity count.
 * doNotContact/archived/rejected/not-relevant contacts are excluded from
 * the ranked list entirely (they're never a "best contact" recommendation)
 * but still counted by getContactCoverageForEntity. Returns an alert
 * message when there's nothing good to recommend.
 */
async function getBestContactsForEntity(workspaceId: string, recordType: ContactLinkableRecordType, recordId: string, limit = 5): Promise<BestContactsForEntityResult> {
  await dbConnect();
  const field = RELATED_RECORD_FIELD[recordType];
  const rows = await ContactModel.find({ workspaceId, [field]: recordId });

  const eligible = rows.filter((r) => !r.doNotContact && !["ARCHIVED", "REJECTED", "NOT_RELEVANT"].includes(r.status as string));

  if (eligible.length === 0) {
    return { contacts: [], alert: NO_CONTACT_ALERTS[recordType] };
  }

  const recommendedRoles = RECOMMENDED_ROLES_BY_ENTITY[recordType];
  const activityCounts = await Promise.all(eligible.map((r) => ContactActivityModel.countDocuments({ workspaceId, contactId: r.id })));

  const ranked: RankedContact[] = eligible.map((doc, index) => {
    const contact = doc.toObject() as Contact;
    const roleIndex = recommendedRoles.indexOf(contact.roleCategory);
    const roleRelevance = roleIndex >= 0 ? 100 - roleIndex * 10 : 20;
    const seniority = SENIORITY_SCORES[contact.seniority] ?? 20;
    const contactability = (contact.email ? 20 : 0) + (contact.phoneNumber || contact.mobileNumber ? 10 : 0);
    const sourceQuality = SOURCE_QUALITY_SCORES[contact.sourceType] ?? 30;
    const verification = verificationRecencyScore(contact.lastVerifiedAt);
    const activityBonus = Math.min(activityCounts[index], 5) * 2;

    const rankScore =
      roleRelevance * 0.3 +
      seniority * 0.15 +
      contact.priorityScore * 0.2 +
      contact.enrichmentScore * 0.15 +
      contactability * 0.1 +
      sourceQuality * 0.05 +
      verification * 0.05 +
      activityBonus;

    return { contact, rankScore: Math.round(rankScore), matchesRecommendedRole: roleIndex >= 0 };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);
  const top = ranked.slice(0, limit);

  const allLowConfidence = top.every((r) => r.contact.confidenceScore < 0.5);
  const alert = allLowConfidence ? LOW_CONFIDENCE_ALERT : null;

  return { contacts: top, alert };
}

export async function getBestContactsForTargetCustomer(workspaceId: string, targetCustomerId: string): Promise<BestContactsForEntityResult> {
  return getBestContactsForEntity(workspaceId, "TARGET_CUSTOMER", targetCustomerId);
}

export async function getBestContactsForProject(workspaceId: string, projectOpportunityId: string): Promise<BestContactsForEntityResult> {
  return getBestContactsForEntity(workspaceId, "PROJECT_OPPORTUNITY", projectOpportunityId);
}

export async function getBestContactsForTenderBuyer(workspaceId: string, tenderBuyerId: string): Promise<BestContactsForEntityResult> {
  return getBestContactsForEntity(workspaceId, "TENDER_BUYER", tenderBuyerId);
}

export async function getBestContactsForTenderOpportunity(workspaceId: string, tenderOpportunityId: string): Promise<BestContactsForEntityResult> {
  return getBestContactsForEntity(workspaceId, "TENDER_OPPORTUNITY", tenderOpportunityId);
}

export async function getBestContactsForVendorRegistration(workspaceId: string, vendorRegistrationId: string): Promise<BestContactsForEntityResult> {
  return getBestContactsForEntity(workspaceId, "VENDOR_REGISTRATION", vendorRegistrationId);
}

export type ContactCoverageForEntity = {
  totalContacts: number;
  eligibleContacts: number;
  hasAnyContact: boolean;
  hasRecommendedRoleMatch: boolean;
  byRoleCategory: Record<string, number>;
};

/** Summary of how well-covered one related record is, contact-wise — for the Related Contacts section's "coverage" indicator on Customer/Project/Tender Buyer/Live Tender/Vendor Registration detail pages. */
export async function getContactCoverageForEntity(workspaceId: string, recordType: ContactLinkableRecordType, recordId: string): Promise<ContactCoverageForEntity> {
  await dbConnect();
  const field = RELATED_RECORD_FIELD[recordType];
  const rows = await ContactModel.find({ workspaceId, [field]: recordId });
  const eligible = rows.filter((r) => !r.doNotContact && !["ARCHIVED", "REJECTED", "NOT_RELEVANT"].includes(r.status as string));
  const recommendedRoles = RECOMMENDED_ROLES_BY_ENTITY[recordType];

  const byRoleCategory: Record<string, number> = {};
  for (const row of rows) {
    const role = row.roleCategory as string;
    byRoleCategory[role] = (byRoleCategory[role] ?? 0) + 1;
  }

  return {
    totalContacts: rows.length,
    eligibleContacts: eligible.length,
    hasAnyContact: rows.length > 0,
    hasRecommendedRoleMatch: eligible.some((r) => recommendedRoles.includes(r.roleCategory as ContactRoleCategory)),
    byRoleCategory,
  };
}

/** Which of the recommended roles for this entity type have no eligible linked contact yet — for a "Missing contact roles" alert list. */
export async function getMissingContactRolesForEntity(workspaceId: string, recordType: ContactLinkableRecordType, recordId: string): Promise<ContactRoleCategory[]> {
  await dbConnect();
  const field = RELATED_RECORD_FIELD[recordType];
  const rows = await ContactModel.find({ workspaceId, [field]: recordId });
  const eligible = rows.filter((r) => !r.doNotContact && !["ARCHIVED", "REJECTED", "NOT_RELEVANT"].includes(r.status as string));
  const coveredRoles = new Set(eligible.map((r) => r.roleCategory as ContactRoleCategory));

  return RECOMMENDED_ROLES_BY_ENTITY[recordType].filter((role) => !coveredRoles.has(role));
}

/** One high-priority/active source-entity config per related-entity type — same statuses generateMissingContactTasksForWorkspace (src/lib/contacts/tasks.ts) uses for its "no contact at all" sweep, duplicated here rather than shared to keep the two modules independently readable. */
const COVERAGE_ENTITY_CONFIGS: { recordType: ContactLinkableRecordType; model: typeof TargetCustomerModel; nameField: string; relatedField: string; statuses: string[] }[] = [
  { recordType: "TARGET_CUSTOMER", model: TargetCustomerModel, nameField: "customerName", relatedField: "relatedTargetCustomerId", statuses: ["NEW", "REVIEWED", "APPROVED", "CONTACTED"] },
  { recordType: "PROJECT_OPPORTUNITY", model: ProjectOpportunityModel, nameField: "clientName", relatedField: "relatedProjectOpportunityId", statuses: ["NEW", "REVIEWED", "APPROVED", "WATCHING", "CONTACTED"] },
  { recordType: "TENDER_BUYER", model: TenderBuyerModel, nameField: "customerName", relatedField: "relatedTenderBuyerId", statuses: ["APPROVED", "WATCHING", "CONTACTED"] },
  { recordType: "TENDER_OPPORTUNITY", model: TenderOpportunityModel, nameField: "buyerOrganization", relatedField: "relatedTenderOpportunityId", statuses: ["ELIGIBLE", "SUBMITTED"] },
  { recordType: "VENDOR_REGISTRATION", model: VendorRegistrationModel, nameField: "customerName", relatedField: "relatedVendorRegistrationId", statuses: ["SUBMITTED", "IN_PROGRESS", "APPROVED"] },
];

export type MissingContactEntity = { recordType: ContactLinkableRecordType; recordId: string; name: string };

export type WorkspaceContactCoverageSummary = {
  totalEntities: number;
  entitiesWithContact: number;
  coveragePercentage: number;
  entitiesWithoutContact: MissingContactEntity[];
};

/** Workspace-wide "how much of our active pipeline has at least one contact" summary — powers the dashboard's best-contact-coverage-percentage metric and the Missing Contact Coverage report. Caps the returned without-contact list at 50 for display purposes; coveragePercentage/counts reflect the full set. */
export async function getWorkspaceContactCoverageSummary(workspaceId: string): Promise<WorkspaceContactCoverageSummary> {
  await dbConnect();

  let totalEntities = 0;
  let entitiesWithContact = 0;
  const entitiesWithoutContact: MissingContactEntity[] = [];

  for (const config of COVERAGE_ENTITY_CONFIGS) {
    const records = await config.model.find({ workspaceId, status: { $in: config.statuses } });
    if (records.length === 0) continue;

    const linkedIds = new Set(
      (await ContactModel.find({ workspaceId, [config.relatedField]: { $ne: null } }, { [config.relatedField]: 1 })).map(
        (c) => c.get(config.relatedField) as string,
      ),
    );

    for (const record of records) {
      totalEntities += 1;
      if (linkedIds.has(record.id as string)) {
        entitiesWithContact += 1;
      } else if (entitiesWithoutContact.length < 50) {
        entitiesWithoutContact.push({ recordType: config.recordType, recordId: record.id as string, name: record.get(config.nameField) as string });
      }
    }
  }

  return {
    totalEntities,
    entitiesWithContact,
    coveragePercentage: totalEntities === 0 ? 100 : Math.round((entitiesWithContact / totalEntities) * 100),
    entitiesWithoutContact,
  };
}
