import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  ContactDiscoveryTarget as ContactDiscoveryTargetModel,
  ContactExtractionRun as ContactExtractionRunModel,
  SearchQuery as SearchQueryModel,
  SearchQueueItem as SearchQueueItemModel,
  RawSearchResult as RawSearchResultModel,
  Contact as ContactModel,
} from "@/models";
import type { ContactDiscoveryTarget, ContactDiscoveryTargetStatus } from "@/models";
import { PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER } from "@/lib/contacts/normalize";

export class ContactDiscoveryTargetNotFoundError extends Error {}

export type ContactDiscoveryTargetFilters = {
  relatedRecordType?: string;
  country?: string;
  priority?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated ContactDiscoveryTargets for a workspace, for the Contact Discovery page's targets table. Sorted so the most worth-searching-next targets surface first: priority desc, never-yet-found-any-contacts first, then oldest last-searched (or never-searched) first. */
export async function listContactDiscoveryTargets(workspaceId: string, filters: ContactDiscoveryTargetFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));

  const query: Record<string, unknown> = { workspaceId };
  if (filters.relatedRecordType) query.relatedRecordType = filters.relatedRecordType;
  if (filters.country) query.country = filters.country;
  if (filters.priority) query.priority = filters.priority;
  if (filters.status) query.status = filters.status;

  const priorityOrder: Record<string, number> = { A_PLUS: 0, A: 1, B: 2, C: 3 };

  const [total, rows] = await Promise.all([
    ContactDiscoveryTargetModel.countDocuments(query),
    ContactDiscoveryTargetModel.find(query)
      .sort({ contactsFound: 1, lastSearchedAt: 1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  const targets = rows.map((r) => r.toObject() as ContactDiscoveryTarget).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { targets, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getContactDiscoveryTarget(workspaceId: string, id: string): Promise<ContactDiscoveryTarget> {
  await dbConnect();
  const doc = await ContactDiscoveryTargetModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactDiscoveryTargetNotFoundError("That contact discovery target doesn't exist in this workspace.");
  return doc.toObject() as ContactDiscoveryTarget;
}

export async function updateContactDiscoveryTargetStatus(
  workspaceId: string,
  id: string,
  status: ContactDiscoveryTargetStatus,
): Promise<ContactDiscoveryTarget> {
  await dbConnect();
  const doc = await ContactDiscoveryTargetModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactDiscoveryTargetNotFoundError("That contact discovery target doesn't exist in this workspace.");
  doc.status = status;
  await doc.save();
  return doc.toObject() as ContactDiscoveryTarget;
}

export type ContactDiscoveryDashboardStats = {
  totalTargets: number;
  queuedSearches: number;
  rawResultsPendingExtraction: number;
  publicContactsDiscovered: number;
  contactsDiscoveredToday: number;
  contactsUpdatedToday: number;
  failedExtractions: number;
};

/** Aggregated counts for the Contact Discovery page's summary cards and the main dashboard's contact-discovery section. */
export async function getContactDiscoveryStats(workspaceId: string): Promise<ContactDiscoveryDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalTargets, queuedSearches, rawResultsPendingExtraction, publicContactsDiscovered, contactsDiscoveredToday, contactsUpdatedToday, failedExtractions] =
    await Promise.all([
      ContactDiscoveryTargetModel.countDocuments({ workspaceId }),
      SearchQueueItemModel.countDocuments({ workspaceId, searchType: "CONTACT", status: "QUEUED" }),
      RawSearchResultModel.countDocuments({ workspaceId, searchType: "CONTACT", extractionStatus: { $ne: "EXTRACTED" }, processedStatus: { $in: ["UNPROCESSED", "FAILED"] } }),
      ContactModel.countDocuments({ workspaceId, sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER }),
      ContactModel.countDocuments({ workspaceId, sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER, createdAt: { $gte: startOfToday } }),
      ContactModel.countDocuments({ workspaceId, sourceType: PUBLICLY_DISCOVERED_SOURCE_TYPE_FILTER, updatedAt: { $gte: startOfToday }, createdAt: { $lt: startOfToday } }),
      RawSearchResultModel.countDocuments({ workspaceId, searchType: "CONTACT", extractionStatus: "FAILED" }),
    ]);

  return {
    totalTargets,
    queuedSearches,
    rawResultsPendingExtraction,
    publicContactsDiscovered,
    contactsDiscoveredToday,
    contactsUpdatedToday,
    failedExtractions,
  };
}

/** Recent CONTACT-searchType raw results for the Contact Discovery page's "recent raw contact results" section, newest first. */
export async function listRecentContactRawResults(workspaceId: string, limit = 20) {
  await dbConnect();
  const rows = await RawSearchResultModel.find({ workspaceId, searchType: "CONTACT" }).sort({ retrievedAt: -1 }).limit(limit);
  const withRelated = await Promise.all(
    rows.map(async (r) => {
      const plain = r.toObject();
      const searchQuery = await SearchQueryModel.findOne({ _id: plain.searchQueryId, workspaceId }, { relatedCompanyName: 1 });
      return { ...plain, relatedCompanyName: searchQuery?.relatedCompanyName ?? null };
    }),
  );
  return withRelated;
}

/** Recently created/updated ContactExtractionRun rows, for the Contact Discovery page (mostly a debugging/audit aid). */
export async function listRecentContactExtractionRuns(workspaceId: string, limit = 10) {
  await dbConnect();
  const rows = await ContactExtractionRunModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit);
  return rows.map((r) => r.toObject());
}

/** CONTACT-searchType raw result counts scoped to one DiscoveryRun, for the Discovery Run detail page's summary cards. */
export async function getContactDiscoveryRunSummary(workspaceId: string, discoveryRunId: string) {
  await dbConnect();
  const [rawContactResults, contactsExtracted] = await Promise.all([
    RawSearchResultModel.countDocuments({ workspaceId, discoveryRunId, searchType: "CONTACT" }),
    RawSearchResultModel.countDocuments({ workspaceId, discoveryRunId, searchType: "CONTACT", extractionStatus: "EXTRACTED" }),
  ]);
  return { rawContactResults, contactsExtracted };
}
