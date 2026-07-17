import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { DuplicateRecord as DuplicateRecordModel, SourceHistory as SourceHistoryModel } from "@/models";
import type { DedupRecordType, SourceHistory } from "@/models";
import { getRecordModel } from "./merge";

export class DuplicateRecordNotFoundError extends Error {}
export class DuplicateRecordNotPendingError extends Error {}

/** True if a DuplicateRecord (in either primary/duplicate order) already exists for this pair — avoids re-flagging the same pair on every scan. Shared by every recordType's dedup engine. */
export async function pairAlreadyRecorded(
  workspaceId: string,
  recordType: DedupRecordType,
  idA: string,
  idB: string,
): Promise<boolean> {
  await dbConnect();
  const existing = await DuplicateRecordModel.findOne({
    workspaceId,
    recordType,
    $or: [
      { primaryRecordId: idA, duplicateRecordId: idB },
      { primaryRecordId: idB, duplicateRecordId: idA },
    ],
  });
  return Boolean(existing);
}

/** Recomputes and sets a record's duplicateStatus after a DuplicateRecord referencing it is resolved without a merge — UNIQUE if nothing else pending references it, otherwise left as POSSIBLE_DUPLICATE. Never touches an already-MERGED record. Works across any recordType that shares the duplicateStatus field shape (TargetCustomer, ProjectOpportunity). */
async function refreshDuplicateStatus(workspaceId: string, recordType: DedupRecordType, recordId: string): Promise<void> {
  const Model = getRecordModel(recordType);
  const record = await Model.findOne({ _id: recordId, workspaceId });
  if (!record || record.duplicateStatus === "MERGED") return;

  const pendingCount = await DuplicateRecordModel.countDocuments({
    workspaceId,
    recordType,
    status: "PENDING_REVIEW",
    $or: [{ primaryRecordId: recordId }, { duplicateRecordId: recordId }],
  });
  record.duplicateStatus = pendingCount > 0 ? "POSSIBLE_DUPLICATE" : "UNIQUE";
  await record.save();
}

/**
 * Resolves a PENDING_REVIEW DuplicateRecord to a terminal status without
 * merging anything — used by Mark Not Duplicate / Reject / Archive, which
 * all share the same "leave both records as-is, just stop flagging them
 * against each other" shape. Generic across recordType.
 */
export async function resolveDuplicateRecordWithoutMerge(
  workspaceId: string,
  duplicateRecordId: string,
  newStatus: "NOT_DUPLICATE" | "REJECTED" | "ARCHIVED",
): Promise<void> {
  await dbConnect();
  const record = await DuplicateRecordModel.findOne({ _id: duplicateRecordId, workspaceId });
  if (!record) throw new DuplicateRecordNotFoundError("That duplicate record doesn't exist in this workspace.");
  if (record.status !== "PENDING_REVIEW") {
    throw new DuplicateRecordNotPendingError("That duplicate record has already been resolved.");
  }

  record.status = newStatus;
  await record.save();

  await refreshDuplicateStatus(workspaceId, record.recordType, record.primaryRecordId);
  await refreshDuplicateStatus(workspaceId, record.recordType, record.duplicateRecordId);
}

export type DuplicateRecordFilters = {
  recordType?: string;
  status?: string;
  minScore?: number;
  maxScore?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  page?: number;
  pageSize?: number;
};

/** Paginated DuplicateRecord list for the Duplicate Review page, with the primary/duplicate record resolved alongside each one — looks up the right model (TargetCustomer/ProjectOpportunity) per row based on its own recordType. */
export async function listDuplicateRecords(workspaceId: string, filters: DuplicateRecordFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));

  const query: Record<string, unknown> = { workspaceId };
  if (filters.recordType) query.recordType = filters.recordType;
  if (filters.status) query.status = filters.status;
  if (filters.minScore !== undefined || filters.maxScore !== undefined) {
    query.duplicateScore = {
      ...(filters.minScore !== undefined ? { $gte: filters.minScore } : {}),
      ...(filters.maxScore !== undefined ? { $lte: filters.maxScore } : {}),
    };
  }
  if (filters.createdAfter || filters.createdBefore) {
    query.createdAt = {
      ...(filters.createdAfter ? { $gte: filters.createdAfter } : {}),
      ...(filters.createdBefore ? { $lte: filters.createdBefore } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    DuplicateRecordModel.countDocuments(query),
    DuplicateRecordModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = idsByType.get(row.recordType) ?? new Set<string>();
    set.add(row.primaryRecordId);
    set.add(row.duplicateRecordId);
    idsByType.set(row.recordType, set);
  }

  const recordById = new Map<string, unknown>();
  for (const [recordType, ids] of idsByType) {
    try {
      const Model = getRecordModel(recordType as DedupRecordType);
      const docs = await Model.find({ _id: { $in: Array.from(ids) } });
      for (const doc of docs) recordById.set(doc.id as string, doc.toObject());
    } catch {
      // No model registered for this recordType yet (project/tender/vendor placeholders) — leave unresolved.
    }
  }

  const records = rows.map((r) => ({
    ...(r.toObject() as {
      id: string;
      recordType: string;
      primaryRecordId: string;
      duplicateRecordId: string;
      duplicateScore: number;
      duplicateReason: string | null;
      matchingFields: string[];
      conflictingFields: string[];
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }),
    primary: recordById.get(r.primaryRecordId) ?? null,
    duplicate: recordById.get(r.duplicateRecordId) ?? null,
  }));

  return { records, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** How many still-unresolved (PENDING_REVIEW) DuplicateRecord rows reference this record, either side — for the "this record has a pending duplicate" warning on the Customers/Projects UI. */
export async function countPendingDuplicatesForRecord(workspaceId: string, recordType: DedupRecordType, recordId: string): Promise<number> {
  await dbConnect();
  return DuplicateRecordModel.countDocuments({
    workspaceId,
    recordType,
    status: "PENDING_REVIEW",
    $or: [{ primaryRecordId: recordId }, { duplicateRecordId: recordId }],
  });
}

/** Field-level change log (Phase 8's generic SourceHistory model) for one record — distinct from that record's own embedded sourceHistory ("which raw results mention this record"), shown alongside it on the Customer/Project detail page. */
export async function listFieldChangeHistory(workspaceId: string, recordType: DedupRecordType, recordId: string): Promise<SourceHistory[]> {
  await dbConnect();
  const rows = await SourceHistoryModel.find({ workspaceId, recordType, recordId }).sort({ capturedAt: -1 });
  return rows.map((r) => r.toObject() as SourceHistory);
}

export type DuplicateDashboardStats = {
  found: number;
  pendingReview: number;
  autoMerged: number;
  manuallyMerged: number;
};

/** Duplicate-record counts for the dashboard/list-page summary cards, optionally scoped to one recordType (omit for a cross-type total). */
export async function getDuplicateDashboardStats(workspaceId: string, recordType?: DedupRecordType): Promise<DuplicateDashboardStats> {
  await dbConnect();
  const base: Record<string, unknown> = { workspaceId };
  if (recordType) base.recordType = recordType;

  const [found, pendingReview, autoMerged, manuallyMerged] = await Promise.all([
    DuplicateRecordModel.countDocuments(base),
    DuplicateRecordModel.countDocuments({ ...base, status: "PENDING_REVIEW" }),
    DuplicateRecordModel.countDocuments({ ...base, status: "AUTO_MERGED" }),
    DuplicateRecordModel.countDocuments({ ...base, status: "MANUALLY_MERGED" }),
  ]);
  return { found, pendingReview, autoMerged, manuallyMerged };
}
