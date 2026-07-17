import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  ContactDiscoveryTarget as ContactDiscoveryTargetModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
} from "@/models";
import type { ContactRelatedRecordType, ContactDiscoveryTargetPriority } from "@/models";
import { normalizeCompanyDomain } from "@/lib/contacts/normalize";

export type GenerateContactDiscoveryTargetsSummary = {
  targetsCreated: number;
  targetsUpdated: number;
  skipped: number;
  duplicatesSkipped: number;
};

/** One grade down (A+ -> A -> B -> C, C stays C) — used to de-prioritize an otherwise-high-priority tender opportunity whose deadline has already passed. */
function downgradePriority(priority: ContactDiscoveryTargetPriority): ContactDiscoveryTargetPriority {
  if (priority === "A_PLUS") return "A";
  if (priority === "A") return "B";
  return "C";
}

type TargetInput = {
  relatedRecordType: ContactRelatedRecordType;
  relatedRecordId: string;
  companyName: string | null | undefined;
  companyWebsite: string | null | undefined;
  companyDomain: string | null | undefined;
  country: string | null | undefined;
  priority: ContactDiscoveryTargetPriority;
  sourceEntityStatus: string;
};

/**
 * Finds (or creates) the ContactDiscoveryTarget for one specific source
 * record — keyed on {workspaceId, relatedRecordType, relatedRecordId}, so a
 * TargetCustomer and a TenderBuyer that happen to be the same real-world
 * company each still get their own target (they link back to different
 * source records, and a discovered Contact needs to know which one to
 * attach to). Updates company info in place if it changed since the target
 * was last generated; otherwise counts it as an already-current duplicate.
 */
async function upsertTarget(workspaceId: string, summary: GenerateContactDiscoveryTargetsSummary, input: TargetInput): Promise<void> {
  const companyName = input.companyName?.trim();
  if (!companyName) {
    summary.skipped += 1;
    return;
  }

  const companyDomain = normalizeCompanyDomain(input.companyWebsite || input.companyDomain || "") || null;
  const companyWebsite = input.companyWebsite || null;
  const country = input.country || null;

  const existing = await ContactDiscoveryTargetModel.findOne({
    workspaceId,
    relatedRecordType: input.relatedRecordType,
    relatedRecordId: input.relatedRecordId,
  });

  if (existing) {
    const changed =
      existing.companyName !== companyName ||
      existing.companyWebsite !== companyWebsite ||
      existing.companyDomain !== companyDomain ||
      existing.country !== country ||
      existing.priority !== input.priority ||
      existing.sourceEntityStatus !== input.sourceEntityStatus;

    if (!changed) {
      summary.duplicatesSkipped += 1;
      return;
    }

    existing.companyName = companyName;
    existing.companyWebsite = companyWebsite;
    existing.companyDomain = companyDomain;
    existing.country = country;
    existing.priority = input.priority;
    existing.sourceEntityStatus = input.sourceEntityStatus;
    await existing.save();
    summary.targetsUpdated += 1;
    return;
  }

  await ContactDiscoveryTargetModel.create({
    workspaceId,
    relatedRecordType: input.relatedRecordType,
    relatedRecordId: input.relatedRecordId,
    companyName,
    companyWebsite,
    companyDomain,
    country,
    priority: input.priority,
    status: "NEW",
    sourceEntityStatus: input.sourceEntityStatus,
  });
  summary.targetsCreated += 1;
}

const TENDER_BUYER_HIGH_PRIORITY_STATUSES = new Set(["APPROVED", "WATCHING", "CONTACTED"]);
const VENDOR_REGISTRATION_HIGH_PRIORITY_STATUSES = new Set(["SUBMITTED", "IN_PROGRESS", "APPROVED"]);

/**
 * Generates/refreshes ContactDiscoveryTarget rows from every discovery
 * entity that can plausibly have a contact worth finding: approved/active
 * TargetCustomers, live ProjectOpportunities/TenderBuyers/
 * TenderOpportunities, and in-flight VendorRegistrations. Never touches the
 * source records themselves — this only maintains the "who should we search
 * for contacts at" queue. Safe to re-run at any time; existing targets are
 * updated in place rather than duplicated (see upsertTarget above).
 */
export async function generateContactDiscoveryTargets(workspaceId: string): Promise<GenerateContactDiscoveryTargetsSummary> {
  await dbConnect();

  const summary: GenerateContactDiscoveryTargetsSummary = { targetsCreated: 0, targetsUpdated: 0, skipped: 0, duplicatesSkipped: 0 };

  const customers = await TargetCustomerModel.find({ workspaceId, duplicateStatus: { $ne: "MERGED" } });
  for (const customer of customers) {
    await upsertTarget(workspaceId, summary, {
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: customer.id,
      companyName: customer.customerName,
      companyWebsite: customer.website,
      companyDomain: customer.websiteDomain,
      country: customer.country,
      priority: customer.priority ?? "C",
      sourceEntityStatus: customer.status,
    });
  }

  const projects = await ProjectOpportunityModel.find({
    workspaceId,
    status: { $in: ["NEW", "REVIEWED", "APPROVED", "WATCHING", "CONTACTED"] },
    duplicateStatus: { $ne: "MERGED" },
  });
  for (const project of projects) {
    await upsertTarget(workspaceId, summary, {
      relatedRecordType: "PROJECT_OPPORTUNITY",
      relatedRecordId: project.id,
      companyName: project.clientName,
      companyWebsite: null,
      companyDomain: null,
      country: project.country,
      priority: project.priority ?? "C",
      sourceEntityStatus: project.status,
    });
  }

  const tenderBuyers = await TenderBuyerModel.find({
    workspaceId,
    status: { $in: ["NEW", "REVIEWED", "APPROVED", "WATCHING", "CONTACTED"] },
    duplicateStatus: { $ne: "MERGED" },
  });
  for (const buyer of tenderBuyers) {
    await upsertTarget(workspaceId, summary, {
      relatedRecordType: "TENDER_BUYER",
      relatedRecordId: buyer.id,
      companyName: buyer.customerName,
      companyWebsite: buyer.website,
      companyDomain: buyer.websiteDomain,
      country: buyer.country,
      priority: TENDER_BUYER_HIGH_PRIORITY_STATUSES.has(buyer.status) ? "A" : "B",
      sourceEntityStatus: buyer.status,
    });
  }

  const tenderOpportunities = await TenderOpportunityModel.find({
    workspaceId,
    status: { $in: ["NEW", "REVIEWED", "ELIGIBLE", "SUBMITTED"] },
    duplicateStatus: { $ne: "MERGED" },
  });
  for (const opportunity of tenderOpportunities) {
    const isExpired = Boolean(opportunity.endDate && opportunity.endDate < new Date());
    const basePriority: ContactDiscoveryTargetPriority = opportunity.priority ?? "C";
    await upsertTarget(workspaceId, summary, {
      relatedRecordType: "TENDER_OPPORTUNITY",
      relatedRecordId: opportunity.id,
      companyName: opportunity.buyerOrganization || opportunity.customerName,
      companyWebsite: null,
      companyDomain: null,
      country: opportunity.country,
      priority: isExpired ? downgradePriority(basePriority) : basePriority,
      sourceEntityStatus: opportunity.status,
    });
  }

  const vendorRegistrations = await VendorRegistrationModel.find({
    workspaceId,
    status: { $in: ["NEW", "REVIEWED", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED"] },
    duplicateStatus: { $ne: "MERGED" },
  });
  for (const registration of vendorRegistrations) {
    await upsertTarget(workspaceId, summary, {
      relatedRecordType: "VENDOR_REGISTRATION",
      relatedRecordId: registration.id,
      companyName: registration.customerName,
      companyWebsite: registration.website,
      companyDomain: registration.websiteDomain,
      country: registration.country,
      priority: VENDOR_REGISTRATION_HIGH_PRIORITY_STATUSES.has(registration.status) ? "A" : "B",
      sourceEntityStatus: registration.status,
    });
  }

  return summary;
}
