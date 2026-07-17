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
  DuplicateRecord as DuplicateRecordModel,
} from "@/models";
import {
  getDailyReport,
  getWeeklyReport,
  getCountryWiseReport,
  getProductWiseReport,
  getTenderExpiryReport,
  getVendorRegistrationReport,
  getContactReport,
  getContactEnrichmentReport,
  getMissingContactCoverageReport,
} from "@/lib/reports/service";
import { isPubliclyDiscoveredContact } from "@/lib/contacts/normalize";
import { formatConfidenceScore } from "@/lib/contacts/scoring";
import { countOpenContactTasksByContactIds } from "@/lib/contacts/tasks";

/** MVP cap on any single CSV export — large exports need real pagination/streaming, out of scope for this phase. */
export const MAX_EXPORT_ROWS = 10_000;

function sourceHistoryUrls(sourceHistory: { url: string | null }[]): string[] {
  return sourceHistory.map((entry) => entry.url).filter((url): url is string => Boolean(url));
}

export const CUSTOMER_EXPORT_COLUMNS = [
  "id",
  "customerName",
  "country",
  "website",
  "websiteDomain",
  "address",
  "phoneNumber",
  "score",
  "priority",
  "status",
  "duplicateStatus",
  "sourceUrl",
  "sourceHistoryUrls",
  "confidenceScore",
  "lastVerifiedAt",
  "createdAt",
];

export async function getCustomersExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await TargetCustomerModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => {
    const obj = r.toObject();
    return { ...obj, sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory) };
  });
}

export const PROJECT_EXPORT_COLUMNS = [
  "id",
  "clientName",
  "projectName",
  "location",
  "country",
  "contractorName",
  "timeline",
  "projectInformationLink",
  "projectStage",
  "score",
  "priority",
  "status",
  "duplicateStatus",
  "sourceUrl",
  "sourceHistoryUrls",
  "confidenceScore",
  "createdAt",
];

export async function getProjectsExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await ProjectOpportunityModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => {
    const obj = r.toObject();
    return { ...obj, sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory) };
  });
}

export const TENDER_BUYER_EXPORT_COLUMNS = [
  "id",
  "customerName",
  "country",
  "address",
  "phoneNumber",
  "website",
  "tenderWebsiteLink",
  "status",
  "duplicateStatus",
  "sourceUrl",
  "sourceHistoryUrls",
  "lastVerifiedAt",
  "createdAt",
];

export async function getTenderBuyersExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await TenderBuyerModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => {
    const obj = r.toObject();
    return { ...obj, sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory) };
  });
}

export const TENDER_OPPORTUNITY_EXPORT_COLUMNS = [
  "id",
  "customerName",
  "buyerOrganization",
  "tenderTitle",
  "startDate",
  "endDate",
  "tenderLink",
  "country",
  "productsServicesRequired",
  "matchedProductServiceName",
  "priorityScore",
  "priority",
  "status",
  "duplicateStatus",
  "sourceUrl",
  "sourceHistoryUrls",
  "lastVerifiedAt",
  "createdAt",
];

export async function getTenderOpportunitiesExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await TenderOpportunityModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => {
    const obj = r.toObject();
    return { ...obj, sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory) };
  });
}

export const VENDOR_REGISTRATION_EXPORT_COLUMNS = [
  "id",
  "customerName",
  "country",
  "address",
  "phoneNumber",
  "website",
  "vendorRegistrationLink",
  "registrationType",
  "requiredDocuments",
  "matchedProductServiceName",
  "status",
  "duplicateStatus",
  "sourceUrl",
  "sourceHistoryUrls",
  "lastVerifiedAt",
  "createdAt",
];

export async function getVendorRegistrationsExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await VendorRegistrationModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => {
    const obj = r.toObject();
    return { ...obj, sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory) };
  });
}

export const DUPLICATE_RECORD_EXPORT_COLUMNS = [
  "id",
  "recordType",
  "primaryRecordId",
  "duplicateRecordId",
  "duplicateScore",
  "duplicateReason",
  "matchingFields",
  "conflictingFields",
  "status",
  "createdAt",
];

export async function getDuplicateRecordsExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await DuplicateRecordModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => r.toObject());
}

export const ACTIVITY_REPORT_EXPORT_COLUMNS = [
  "periodStart",
  "periodEnd",
  "customersCreated",
  "projectsCreated",
  "tenderBuyersCreated",
  "liveTendersCreated",
  "vendorRegistrationsCreated",
  "duplicatesFound",
  "rawResultsProcessed",
  "errors",
];

export async function getDailyReportExportRows(workspaceId: string) {
  return [await getDailyReport(workspaceId)];
}

export async function getWeeklyReportExportRows(workspaceId: string) {
  return [await getWeeklyReport(workspaceId)];
}

export const COUNTRY_REPORT_EXPORT_COLUMNS = ["country", "customers", "projects", "tenderBuyers", "liveTenders", "vendorRegistrations"];

export async function getCountryReportExportRows(workspaceId: string) {
  return getCountryWiseReport(workspaceId);
}

export const PRODUCT_REPORT_EXPORT_COLUMNS = ["productServiceName", "customers", "projects", "tenders", "vendorRegistrations"];

export async function getProductReportExportRows(workspaceId: string) {
  return getProductWiseReport(workspaceId);
}

export const TENDER_EXPIRY_REPORT_EXPORT_COLUMNS = ["active", "expiringIn7Days", "expired", "submitted", "won", "lost"];

export async function getTenderExpiryReportExportRows(workspaceId: string) {
  return [await getTenderExpiryReport(workspaceId)];
}

export const VENDOR_REGISTRATION_REPORT_EXPORT_COLUMNS = [
  "new",
  "reviewed",
  "notStarted",
  "inProgress",
  "submitted",
  "approved",
  "rejected",
  "archived",
];

export async function getVendorRegistrationReportExportRows(workspaceId: string) {
  return [await getVendorRegistrationReport(workspaceId)];
}

export const CONTACT_EXPORT_COLUMNS = [
  "id",
  "fullName",
  "companyName",
  "designation",
  "department",
  "roleCategory",
  "seniority",
  "email",
  "emailStatus",
  "phoneNumber",
  "mobileNumber",
  "linkedinUrl",
  "country",
  "location",
  "priorityScore",
  "priority",
  "status",
  "sourceUrl",
  "sourceType",
  "isPubliclyDiscovered",
  "confidencePercent",
  "sourceHistoryUrls",
  "lastVerifiedAt",
  "lastContactedAt",
  "nextFollowUpAt",
  "relatedRecordIds",
  "enrichmentStatus",
  "enrichmentScore",
  "missingFields",
  "recommendedAction",
  "bestContactFor",
  "doNotContact",
  "ownerUserId",
  "assignedToUserId",
  "openTaskCount",
  "notes",
  "tags",
];

function relatedRecordIds(contact: {
  relatedTargetCustomerId: string | null;
  relatedProjectOpportunityId: string | null;
  relatedTenderBuyerId: string | null;
  relatedTenderOpportunityId: string | null;
  relatedVendorRegistrationId: string | null;
}): string[] {
  return [
    contact.relatedTargetCustomerId && `TARGET_CUSTOMER:${contact.relatedTargetCustomerId}`,
    contact.relatedProjectOpportunityId && `PROJECT:${contact.relatedProjectOpportunityId}`,
    contact.relatedTenderBuyerId && `TENDER_BUYER:${contact.relatedTenderBuyerId}`,
    contact.relatedTenderOpportunityId && `TENDER_OPPORTUNITY:${contact.relatedTenderOpportunityId}`,
    contact.relatedVendorRegistrationId && `VENDOR_REGISTRATION:${contact.relatedVendorRegistrationId}`,
  ].filter((v): v is string => Boolean(v));
}

export async function getContactsExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await ContactModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  const openTaskCounts = await countOpenContactTasksByContactIds(workspaceId, rows.map((r) => r.id as string));
  return rows.map((r) => {
    const obj = r.toObject();
    return {
      ...obj,
      relatedRecordIds: relatedRecordIds(obj),
      sourceHistoryUrls: sourceHistoryUrls(obj.sourceHistory),
      isPubliclyDiscovered: isPubliclyDiscoveredContact(obj.sourceType),
      confidencePercent: formatConfidenceScore(obj.confidenceScore),
      openTaskCount: openTaskCounts[obj.id as string] ?? 0,
    };
  });
}

export const CONTACT_REPORT_EXPORT_COLUMNS = [
  "total",
  "publiclyDiscovered",
  "manuallyAdded",
  "withEmail",
  "withoutEmail",
  "withLinkedIn",
  "needingFollowUp",
  "needingVerification",
];

export async function getContactReportExportRows(workspaceId: string) {
  return [await getContactReport(workspaceId)];
}

export const CONTACT_TASK_EXPORT_COLUMNS = [
  "id",
  "contactId",
  "relatedRecordType",
  "relatedRecordId",
  "title",
  "description",
  "taskType",
  "status",
  "priority",
  "dueDate",
  "completedAt",
  "assignedToUserId",
  "createdBy",
  "createdAt",
];

export async function getContactTasksExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await ContactTaskModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => r.toObject());
}

export const CONTACT_ENRICHMENT_REPORT_EXPORT_COLUMNS = ["averageEnrichmentScore", "doNotContactCount"];

export async function getContactEnrichmentReportExportRows(workspaceId: string) {
  return [await getContactEnrichmentReport(workspaceId)];
}

export const MISSING_CONTACT_COVERAGE_EXPORT_COLUMNS = ["recordType", "recordId", "name"];

/** One row per company/opportunity with no contact yet — the coverage summary's aggregate counters (totalEntities/coveragePercentage) aren't columns here since they're workspace-level, not per-row; see the Reports page for those. */
export async function getMissingContactCoverageExportRows(workspaceId: string) {
  const summary = await getMissingContactCoverageReport(workspaceId);
  return summary.entitiesWithoutContact;
}

export const CONTACT_EMAIL_TEMPLATE_EXPORT_COLUMNS = [
  "id",
  "name",
  "templateType",
  "subject",
  "body",
  "productServiceContext",
  "isDefault",
  "createdBy",
  "createdAt",
];

export async function getContactEmailTemplatesExportRows(workspaceId: string) {
  await dbConnect();
  const rows = await ContactEmailTemplateModel.find({ workspaceId }).sort({ isDefault: -1, name: 1 }).limit(MAX_EXPORT_ROWS);
  return rows.map((r) => r.toObject());
}
