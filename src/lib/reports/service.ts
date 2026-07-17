import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
  Contact as ContactModel,
  ContactTask as ContactTaskModel,
  ContactEmailTemplate as ContactEmailTemplateModel,
  ContactActivity as ContactActivityModel,
  DuplicateRecord as DuplicateRecordModel,
  RawSearchResult as RawSearchResultModel,
  DiscoveryErrorLog as DiscoveryErrorLogModel,
} from "@/models";
import { getEntityCountsByCountry } from "@/lib/discovery-brain/coverage";
import type { EntityCountsByCountryRow } from "@/lib/discovery-brain/coverage";
import { PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER } from "@/lib/contacts/normalize";
import { getWorkspaceContactCoverageSummary } from "@/lib/contacts/recommendations";
import type { WorkspaceContactCoverageSummary } from "@/lib/contacts/recommendations";

export type ActivityReport = {
  periodStart: Date;
  periodEnd: Date;
  customersCreated: number;
  projectsCreated: number;
  tenderBuyersCreated: number;
  liveTendersCreated: number;
  vendorRegistrationsCreated: number;
  duplicatesFound: number;
  rawResultsProcessed: number;
  errors: number;
};

/** Shared implementation for the Daily and Weekly reports — both are "activity between two timestamps", just with a different window. */
async function getActivityReport(workspaceId: string, periodStart: Date, periodEnd: Date): Promise<ActivityReport> {
  await dbConnect();
  const createdWindow = { $gte: periodStart, $lt: periodEnd };

  const [
    customersCreated,
    projectsCreated,
    tenderBuyersCreated,
    liveTendersCreated,
    vendorRegistrationsCreated,
    duplicatesFound,
    rawResultsProcessed,
    errors,
  ] = await Promise.all([
    TargetCustomerModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    ProjectOpportunityModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    TenderBuyerModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    TenderOpportunityModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    VendorRegistrationModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    DuplicateRecordModel.countDocuments({ workspaceId, createdAt: createdWindow }),
    RawSearchResultModel.countDocuments({ workspaceId, processedStatus: "PROCESSED", updatedAt: createdWindow }),
    DiscoveryErrorLogModel.countDocuments({ workspaceId, createdAt: createdWindow }),
  ]);

  return {
    periodStart,
    periodEnd,
    customersCreated,
    projectsCreated,
    tenderBuyersCreated,
    liveTendersCreated,
    vendorRegistrationsCreated,
    duplicatesFound,
    rawResultsProcessed,
    errors,
  };
}

/** Activity in the last 24 hours. */
export async function getDailyReport(workspaceId: string): Promise<ActivityReport> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
  return getActivityReport(workspaceId, periodStart, periodEnd);
}

/** Activity in the last 7 days. */
export async function getWeeklyReport(workspaceId: string): Promise<ActivityReport> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return getActivityReport(workspaceId, periodStart, periodEnd);
}

/** Discovered-record counts per country, across every entity type — reuses the Coverage page's same aggregation. */
export async function getCountryWiseReport(workspaceId: string): Promise<EntityCountsByCountryRow[]> {
  return getEntityCountsByCountry(workspaceId);
}

export type ProductWiseReportRow = {
  productServiceName: string;
  customers: number;
  projects: number;
  tenders: number;
  vendorRegistrations: number;
};

async function countByProduct(
  Model: { aggregate: (pipeline: import("mongoose").PipelineStage[]) => Promise<unknown> },
  workspaceId: string,
  field = "matchedProductServiceName",
): Promise<Map<string, number>> {
  const rows = (await Model.aggregate([
    { $match: { workspaceId, [field]: { $nin: [null, ""] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ])) as { _id: string; count: number }[];
  return new Map(rows.map((r) => [r._id, r.count]));
}

/** Discovered-record counts per matched product/service, across customers/projects/live tenders/vendor registrations (tender buyers have no product match — they're the buyer, not the opportunity). */
export async function getProductWiseReport(workspaceId: string): Promise<ProductWiseReportRow[]> {
  await dbConnect();

  const [customers, projects, tenders, vendorRegistrations] = await Promise.all([
    countByProduct(TargetCustomerModel, workspaceId),
    countByProduct(ProjectOpportunityModel, workspaceId),
    countByProduct(TenderOpportunityModel, workspaceId),
    countByProduct(VendorRegistrationModel, workspaceId),
  ]);

  const products = new Set([...customers.keys(), ...projects.keys(), ...tenders.keys(), ...vendorRegistrations.keys()]);

  return [...products]
    .map((productServiceName) => ({
      productServiceName,
      customers: customers.get(productServiceName) ?? 0,
      projects: projects.get(productServiceName) ?? 0,
      tenders: tenders.get(productServiceName) ?? 0,
      vendorRegistrations: vendorRegistrations.get(productServiceName) ?? 0,
    }))
    .sort((a, b) => b.customers + b.projects + b.tenders + b.vendorRegistrations - (a.customers + a.projects + a.tenders + a.vendorRegistrations));
}

export type IndustryWiseReportRow = { industry: string; customers: number; projects: number };

/** Discovered-record counts per industry — customers via matchedIndustry, projects via their own industry field (the only two models that carry an industry-shaped field today). */
export async function getIndustryWiseReport(workspaceId: string): Promise<IndustryWiseReportRow[]> {
  await dbConnect();

  const [customers, projects] = await Promise.all([
    countByProduct(TargetCustomerModel, workspaceId, "matchedIndustry"),
    countByProduct(ProjectOpportunityModel, workspaceId, "industry"),
  ]);

  const industries = new Set([...customers.keys(), ...projects.keys()]);
  return [...industries]
    .map((industry) => ({ industry, customers: customers.get(industry) ?? 0, projects: projects.get(industry) ?? 0 }))
    .sort((a, b) => b.customers + b.projects - (a.customers + a.projects));
}

export type SourceWiseReportRow = { sourceProvider: string; total: number; extracted: number; unprocessed: number };

/** Raw-result counts per search provider — how much each source has contributed, and how much of it has actually been turned into a record yet. */
export async function getSourceWiseReport(workspaceId: string): Promise<SourceWiseReportRow[]> {
  await dbConnect();

  const rows = (await RawSearchResultModel.aggregate([
    { $match: { workspaceId } },
    {
      $group: {
        _id: "$sourceProvider",
        total: { $sum: 1 },
        extracted: { $sum: { $cond: [{ $eq: ["$extractionStatus", "EXTRACTED"] }, 1, 0] } },
        unprocessed: { $sum: { $cond: [{ $eq: ["$processedStatus", "UNPROCESSED"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ])) as { _id: string; total: number; extracted: number; unprocessed: number }[];

  return rows.map((r) => ({ sourceProvider: r._id, total: r.total, extracted: r.extracted, unprocessed: r.unprocessed }));
}

export type DuplicateReportRow = {
  recordType: string;
  pendingReview: number;
  autoMerged: number;
  manuallyMerged: number;
  rejected: number;
  notDuplicate: number;
};

const DUPLICATE_REPORT_RECORD_TYPES = ["CUSTOMER", "PROJECT", "TENDER_BUYER", "TENDER_OPPORTUNITY", "VENDOR_REGISTRATION"] as const;

/** Per-recordType breakdown of every DuplicateRecord's resolution status. */
export async function getDuplicateReport(workspaceId: string): Promise<DuplicateReportRow[]> {
  await dbConnect();

  return Promise.all(
    DUPLICATE_REPORT_RECORD_TYPES.map(async (recordType) => {
      const [pendingReview, autoMerged, manuallyMerged, rejected, notDuplicate] = await Promise.all([
        DuplicateRecordModel.countDocuments({ workspaceId, recordType, status: "PENDING_REVIEW" }),
        DuplicateRecordModel.countDocuments({ workspaceId, recordType, status: "AUTO_MERGED" }),
        DuplicateRecordModel.countDocuments({ workspaceId, recordType, status: "MANUALLY_MERGED" }),
        DuplicateRecordModel.countDocuments({ workspaceId, recordType, status: "REJECTED" }),
        DuplicateRecordModel.countDocuments({ workspaceId, recordType, status: "NOT_DUPLICATE" }),
      ]);
      return { recordType, pendingReview, autoMerged, manuallyMerged, rejected, notDuplicate };
    }),
  );
}

export type TenderExpiryReport = {
  active: number;
  expiringIn7Days: number;
  expired: number;
  submitted: number;
  won: number;
  lost: number;
};

/** Snapshot of TenderOpportunity lifecycle state — active/expiring/expired by endDate, plus submitted/won/lost by status. */
export async function getTenderExpiryReport(workspaceId: string): Promise<TenderExpiryReport> {
  await dbConnect();

  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [active, expiringIn7Days, expired, submitted, won, lost] = await Promise.all([
    TenderOpportunityModel.countDocuments({ workspaceId, $or: [{ endDate: null }, { endDate: { $gte: now } }] }),
    TenderOpportunityModel.countDocuments({ workspaceId, endDate: { $gte: now, $lte: sevenDaysOut } }),
    TenderOpportunityModel.countDocuments({ workspaceId, endDate: { $ne: null, $lt: now } }),
    TenderOpportunityModel.countDocuments({ workspaceId, status: "SUBMITTED" }),
    TenderOpportunityModel.countDocuments({ workspaceId, status: "WON" }),
    TenderOpportunityModel.countDocuments({ workspaceId, status: "LOST" }),
  ]);

  return { active, expiringIn7Days, expired, submitted, won, lost };
}

export type ContactReport = {
  total: number;
  byRoleCategory: Record<string, number>;
  byCountry: { country: string; count: number }[];
  bySourceType: Record<string, number>;
  byStatus: Record<string, number>;
  withEmail: number;
  withoutEmail: number;
  withLinkedIn: number;
  needingFollowUp: number;
  /** Phase 11.5B: contacts found via public contact discovery (any sourceType other than manual entry) vs manually added. */
  publiclyDiscovered: number;
  manuallyAdded: number;
  /** Which kind of discovered record (TargetCustomer/ProjectOpportunity/TenderBuyer/TenderOpportunity/VendorRegistration) each contact is linked to, if any — a contact linked to none is grouped under NONE. */
  byDiscoveryTargetType: Record<string, number>;
  /** Publicly-discovered contacts with a low confidence score — worth a human double-check before relying on them. */
  needingVerification: number;
};

/** Contact directory report — counts by role category/country/source type/status, contactability (email/LinkedIn), public-vs-manual origin, linked discovery-target type, and follow-up/verification backlog. */
export async function getContactReport(workspaceId: string): Promise<ContactReport> {
  await dbConnect();

  const now = new Date();

  const [
    total,
    roleAgg,
    countryAgg,
    sourceTypeAgg,
    statusAgg,
    withEmail,
    withoutEmail,
    withLinkedIn,
    needingFollowUp,
    publiclyDiscovered,
    linkedToTargetCustomers,
    linkedToProjects,
    linkedToTenderBuyers,
    linkedToTenderOpportunities,
    linkedToVendorRegistrations,
    needingVerification,
  ] = await Promise.all([
    ContactModel.countDocuments({ workspaceId }),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$roleCategory", count: { $sum: 1 } } }]),
    ContactModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$sourceType", count: { $sum: 1 } } }]),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ContactModel.countDocuments({ workspaceId, email: { $nin: [null, ""] } }),
    ContactModel.countDocuments({ workspaceId, $or: [{ email: null }, { email: "" }] }),
    ContactModel.countDocuments({ workspaceId, linkedinUrl: { $nin: [null, ""] } }),
    ContactModel.countDocuments({ workspaceId, nextFollowUpAt: { $ne: null, $lte: now } }),
    ContactModel.countDocuments({ workspaceId, sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER }),
    ContactModel.countDocuments({ workspaceId, relatedTargetCustomerId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedProjectOpportunityId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedTenderBuyerId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedTenderOpportunityId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, relatedVendorRegistrationId: { $ne: null } }),
    ContactModel.countDocuments({ workspaceId, sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER, confidenceScore: { $lt: 0.5 } }),
  ]);

  const byRoleCategory: Record<string, number> = {};
  for (const row of roleAgg as { _id: string | null; count: number }[]) byRoleCategory[row._id ?? "OTHER"] = row.count;

  const bySourceType: Record<string, number> = {};
  for (const row of sourceTypeAgg as { _id: string | null; count: number }[]) bySourceType[row._id ?? "OTHER"] = row.count;

  const byStatus: Record<string, number> = {};
  for (const row of statusAgg as { _id: string | null; count: number }[]) byStatus[row._id ?? "NEW"] = row.count;

  const linkedTotal = linkedToTargetCustomers + linkedToProjects + linkedToTenderBuyers + linkedToTenderOpportunities + linkedToVendorRegistrations;
  const byDiscoveryTargetType: Record<string, number> = {
    TARGET_CUSTOMER: linkedToTargetCustomers,
    PROJECT_OPPORTUNITY: linkedToProjects,
    TENDER_BUYER: linkedToTenderBuyers,
    TENDER_OPPORTUNITY: linkedToTenderOpportunities,
    VENDOR_REGISTRATION: linkedToVendorRegistrations,
    NONE: Math.max(0, total - linkedTotal),
  };

  return {
    total,
    byRoleCategory,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    bySourceType,
    byStatus,
    withEmail,
    withoutEmail,
    withLinkedIn,
    needingFollowUp,
    publiclyDiscovered,
    manuallyAdded: total - publiclyDiscovered,
    byDiscoveryTargetType,
    needingVerification,
  };
}

export type VendorRegistrationReport = {
  new: number;
  reviewed: number;
  notStarted: number;
  inProgress: number;
  submitted: number;
  approved: number;
  rejected: number;
  archived: number;
};

/** Vendor registration counts by status. */
export async function getVendorRegistrationReport(workspaceId: string): Promise<VendorRegistrationReport> {
  await dbConnect();

  const [newCount, reviewed, notStarted, inProgress, submitted, approved, rejected, archived] = await Promise.all([
    VendorRegistrationModel.countDocuments({ workspaceId, status: "NEW" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "REVIEWED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "NOT_STARTED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "IN_PROGRESS" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "SUBMITTED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "APPROVED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "REJECTED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "ARCHIVED" }),
  ]);

  return { new: newCount, reviewed, notStarted, inProgress, submitted, approved, rejected, archived };
}

export type ContactEnrichmentReport = {
  byEnrichmentStatus: Record<string, number>;
  byRecommendedAction: Record<string, number>;
  byBestContactFor: Record<string, number>;
  averageEnrichmentScore: number;
  doNotContactCount: number;
};

/** Enrichment/CRM-workflow breakdown — by enrichment status, recommended action, and best-contact-for, plus average enrichment score and how many contacts are marked do-not-contact. */
export async function getContactEnrichmentReport(workspaceId: string): Promise<ContactEnrichmentReport> {
  await dbConnect();

  const [enrichmentAgg, actionAgg, bestForAgg, scoreAgg, doNotContactCount] = await Promise.all([
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$enrichmentStatus", count: { $sum: 1 } } }]),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$recommendedAction", count: { $sum: 1 } } }]),
    ContactModel.aggregate([
      { $match: { workspaceId, bestContactFor: { $ne: null } } },
      { $group: { _id: "$bestContactFor", count: { $sum: 1 } } },
    ]),
    ContactModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: null, avg: { $avg: "$enrichmentScore" } } }]),
    ContactModel.countDocuments({ workspaceId, doNotContact: true }),
  ]);

  const byEnrichmentStatus: Record<string, number> = {};
  for (const row of enrichmentAgg as { _id: string | null; count: number }[]) byEnrichmentStatus[row._id ?? "NEEDS_VERIFICATION"] = row.count;

  const byRecommendedAction: Record<string, number> = {};
  for (const row of actionAgg as { _id: string | null; count: number }[]) byRecommendedAction[row._id ?? "NONE"] = row.count;

  const byBestContactFor: Record<string, number> = {};
  for (const row of bestForAgg as { _id: string; count: number }[]) byBestContactFor[row._id] = row.count;

  const averageEnrichmentScore = Math.round(((scoreAgg[0] as { avg: number } | undefined)?.avg ?? 0));

  return { byEnrichmentStatus, byRecommendedAction, byBestContactFor, averageEnrichmentScore, doNotContactCount };
}

export type FollowUpTaskReport = {
  byTaskType: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
  completedThisWeek: number;
};

/** Contact-task/follow-up workflow breakdown — by task type/status/priority, plus overdue count and tasks completed in the last 7 days. */
export async function getFollowUpTaskReport(workspaceId: string): Promise<FollowUpTaskReport> {
  await dbConnect();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [typeAgg, statusAgg, priorityAgg, overdue, completedThisWeek] = await Promise.all([
    ContactTaskModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$taskType", count: { $sum: 1 } } }]),
    ContactTaskModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ContactTaskModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    ContactTaskModel.countDocuments({ workspaceId, status: { $in: ["OPEN", "IN_PROGRESS"] }, dueDate: { $ne: null, $lt: now } }),
    ContactTaskModel.countDocuments({ workspaceId, status: "COMPLETED", completedAt: { $gte: sevenDaysAgo } }),
  ]);

  const byTaskType: Record<string, number> = {};
  for (const row of typeAgg as { _id: string; count: number }[]) byTaskType[row._id] = row.count;

  const byStatus: Record<string, number> = {};
  for (const row of statusAgg as { _id: string; count: number }[]) byStatus[row._id] = row.count;

  const byPriority: Record<string, number> = {};
  for (const row of priorityAgg as { _id: string; count: number }[]) byPriority[row._id] = row.count;

  return { byTaskType, byStatus, byPriority, overdue, completedThisWeek };
}

/** Workspace-wide "which companies/opportunities have no contact yet" report — a thin re-export of the recommendations service's coverage summary, kept here so it shows up alongside every other report. */
export async function getMissingContactCoverageReport(workspaceId: string): Promise<WorkspaceContactCoverageSummary> {
  return getWorkspaceContactCoverageSummary(workspaceId);
}

export type EmailTemplateUsageReport = {
  totalTemplates: number;
  defaultTemplates: number;
  customTemplates: number;
  byTemplateType: Record<string, number>;
  emailDraftsLogged: number;
};

/** Email template inventory + how many drafts have actually been logged (ContactActivity outcome=EMAIL_DRAFTED) — this app never sends email, so "usage" means drafts prepared/logged, not delivery. */
export async function getEmailTemplateUsageReport(workspaceId: string): Promise<EmailTemplateUsageReport> {
  await dbConnect();

  const [totalTemplates, defaultTemplates, typeAgg, emailDraftsLogged] = await Promise.all([
    ContactEmailTemplateModel.countDocuments({ workspaceId }),
    ContactEmailTemplateModel.countDocuments({ workspaceId, isDefault: true }),
    ContactEmailTemplateModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$templateType", count: { $sum: 1 } } }]),
    ContactActivityModel.countDocuments({ workspaceId, outcome: "EMAIL_DRAFTED" }),
  ]);

  const byTemplateType: Record<string, number> = {};
  for (const row of typeAgg as { _id: string; count: number }[]) byTemplateType[row._id] = row.count;

  return { totalTemplates, defaultTemplates, customTemplates: totalTemplates - defaultTemplates, byTemplateType, emailDraftsLogged };
}
