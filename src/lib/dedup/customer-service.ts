import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TargetCustomer as TargetCustomerModel, DuplicateRecord as DuplicateRecordModel } from "@/models";
import type { TargetCustomer } from "@/models";
import { calculateCustomerDuplicateScore } from "./scoring";
import type { CustomerDuplicateCandidate } from "./scoring";
import { mergeRecords } from "./merge";
import { pairAlreadyRecorded } from "./service";
import { DUPLICATE_SCORE_THRESHOLDS, DEDUP_SCAN_LIMIT } from "./constants";

export type DeduplicationMode = "SCAN_ALL" | "RECENT_ONLY";

export type RunDeduplicationSummary = {
  recordsScanned: number;
  duplicatesFound: number;
  autoMerged: number;
  pendingReview: number;
  errors: number;
};

function toCandidate(customer: TargetCustomer): CustomerDuplicateCandidate {
  return {
    customerName: customer.customerName,
    country: customer.country ?? "",
    websiteDomain: customer.websiteDomain ?? "",
    address: customer.address ?? "",
    phoneNumber: customer.phoneNumber ?? "",
    sourceUrl: customer.sourceUrl ?? "",
  };
}

/**
 * Scores one candidate pair and, depending on the score, either auto-merges
 * (>=95), records a PENDING_REVIEW DuplicateRecord for a human to decide
 * (75-94), or does nothing (<75). Shared by both the full workspace scan and
 * the single-record check the customer processor triggers after creating a
 * new customer.
 */
async function evaluatePair(
  workspaceId: string,
  a: TargetCustomer,
  b: TargetCustomer,
): Promise<{ outcome: "AUTO_MERGED" | "PENDING_REVIEW" | "IGNORED" | "ALREADY_RECORDED" }> {
  if (a.duplicateStatus === "MERGED" || b.duplicateStatus === "MERGED") return { outcome: "IGNORED" };
  if (await pairAlreadyRecorded(workspaceId, "CUSTOMER", a.id, b.id)) return { outcome: "ALREADY_RECORDED" };

  const { score, matchingFields, conflictingFields, reason } = calculateCustomerDuplicateScore(toCandidate(a), toCandidate(b));
  if (score < DUPLICATE_SCORE_THRESHOLDS.review) return { outcome: "IGNORED" };

  const [primary, duplicate] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

  if (score >= DUPLICATE_SCORE_THRESHOLDS.autoMerge) {
    const duplicateRecord = await DuplicateRecordModel.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: primary.id,
      duplicateRecordId: duplicate.id,
      duplicateScore: score,
      duplicateReason: reason,
      matchingFields,
      conflictingFields,
      status: "AUTO_MERGED",
    });
    await mergeRecords(workspaceId, "CUSTOMER", primary.id, duplicate.id, {
      mergedBy: null,
      mergeReason: reason,
      duplicateRecordId: duplicateRecord.id,
    });
    return { outcome: "AUTO_MERGED" };
  }

  await DuplicateRecordModel.create({
    workspaceId,
    recordType: "CUSTOMER",
    primaryRecordId: primary.id,
    duplicateRecordId: duplicate.id,
    duplicateScore: score,
    duplicateReason: reason,
    matchingFields,
    conflictingFields,
    status: "PENDING_REVIEW",
  });
  await TargetCustomerModel.updateMany(
    { _id: { $in: [primary.id, duplicate.id] }, duplicateStatus: "UNIQUE" },
    { duplicateStatus: "POSSIBLE_DUPLICATE" },
  );
  return { outcome: "PENDING_REVIEW" };
}

/**
 * Scans TargetCustomer records within one workspace only, comparing pairs
 * for likely duplicates. Bounded by DEDUP_SCAN_LIMIT (simple O(n^2) within
 * that cap) — fine at MVP scale. RECENT_ONLY narrows the initial candidate
 * set to records touched in the last 24h (still compared against the full
 * candidate set, so a brand-new record can match an old one).
 */
export async function runCustomerDeduplication(
  workspaceId: string,
  options: { mode?: DeduplicationMode } = {},
): Promise<RunDeduplicationSummary> {
  await dbConnect();

  const mode = options.mode ?? "SCAN_ALL";
  const query: Record<string, unknown> = { workspaceId, duplicateStatus: { $ne: "MERGED" } };
  if (mode === "RECENT_ONLY") {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    query.$or = [{ createdAt: { $gte: cutoff } }, { updatedAt: { $gte: cutoff } }];
  }

  const docs = await TargetCustomerModel.find(query).sort({ createdAt: 1 }).limit(DEDUP_SCAN_LIMIT);
  const candidates = docs.map((d) => d.toObject() as TargetCustomer);

  const summary: RunDeduplicationSummary = { recordsScanned: candidates.length, duplicatesFound: 0, autoMerged: 0, pendingReview: 0, errors: 0 };
  const mergedAway = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    if (mergedAway.has(candidates[i].id)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      if (mergedAway.has(candidates[j].id)) continue;
      try {
        const result = await evaluatePair(workspaceId, candidates[i], candidates[j]);
        if (result.outcome === "AUTO_MERGED") {
          summary.duplicatesFound += 1;
          summary.autoMerged += 1;
          mergedAway.add(candidates[j].createdAt <= candidates[i].createdAt ? candidates[i].id : candidates[j].id);
        } else if (result.outcome === "PENDING_REVIEW") {
          summary.duplicatesFound += 1;
          summary.pendingReview += 1;
        }
      } catch (error) {
        console.error(`Deduplication failed comparing ${candidates[i].id} and ${candidates[j].id}:`, error);
        summary.errors += 1;
      }
    }
  }

  return summary;
}

/**
 * Checks a single newly-created/updated customer against other active
 * customers in its workspace — triggered by the customer processor right
 * after it creates a customer (see src/lib/customers/processor.ts). Cheaper
 * than a full workspace scan since it's O(n) for one record, not O(n^2).
 */
export async function checkCustomerForDuplicates(workspaceId: string, customerId: string): Promise<void> {
  await dbConnect();

  const target = await TargetCustomerModel.findOne({ _id: customerId, workspaceId });
  if (!target || target.duplicateStatus === "MERGED") return;

  const others = await TargetCustomerModel.find({
    workspaceId,
    _id: { $ne: customerId },
    duplicateStatus: { $ne: "MERGED" },
  }).limit(DEDUP_SCAN_LIMIT);

  const targetPlain = target.toObject() as TargetCustomer;
  for (const otherDoc of others) {
    try {
      const result = await evaluatePair(workspaceId, targetPlain, otherDoc.toObject() as TargetCustomer);
      if (result.outcome === "AUTO_MERGED") break; // target itself may now be the merged-away row
    } catch (error) {
      console.error(`Post-processing duplicate check failed for customer ${customerId}:`, error);
    }
  }
}
