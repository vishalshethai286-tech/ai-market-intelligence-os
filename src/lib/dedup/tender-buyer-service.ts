import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TenderBuyer as TenderBuyerModel, DuplicateRecord as DuplicateRecordModel } from "@/models";
import type { TenderBuyer } from "@/models";
import { calculateTenderBuyerDuplicateScore } from "./scoring";
import type { TenderBuyerDuplicateCandidate } from "./scoring";
import { mergeRecords } from "./merge";
import { pairAlreadyRecorded } from "./service";
import { DUPLICATE_SCORE_THRESHOLDS, DEDUP_SCAN_LIMIT } from "./constants";
import type { DeduplicationMode, RunDeduplicationSummary } from "./customer-service";

function toCandidate(buyer: TenderBuyer): TenderBuyerDuplicateCandidate {
  return {
    customerName: buyer.customerName,
    country: buyer.country ?? "",
    websiteDomain: buyer.websiteDomain ?? "",
    tenderWebsiteLink: buyer.tenderWebsiteLink ?? "",
    phoneNumber: buyer.phoneNumber ?? "",
    sourceUrl: buyer.sourceUrl ?? "",
  };
}

/**
 * Scores one candidate pair and, depending on the score, either auto-merges
 * (>=95), records a PENDING_REVIEW DuplicateRecord for a human to decide
 * (75-94), or does nothing (<75). Shared by both the full workspace scan and
 * the single-record check the tender processor triggers after creating a
 * new buyer. Mirrors src/lib/dedup/customer-service.ts's evaluatePair.
 */
async function evaluatePair(
  workspaceId: string,
  a: TenderBuyer,
  b: TenderBuyer,
): Promise<{ outcome: "AUTO_MERGED" | "PENDING_REVIEW" | "IGNORED" | "ALREADY_RECORDED" }> {
  if (a.duplicateStatus === "MERGED" || b.duplicateStatus === "MERGED") return { outcome: "IGNORED" };
  if (await pairAlreadyRecorded(workspaceId, "TENDER_BUYER", a.id, b.id)) return { outcome: "ALREADY_RECORDED" };

  const { score, matchingFields, conflictingFields, reason } = calculateTenderBuyerDuplicateScore(toCandidate(a), toCandidate(b));
  if (score < DUPLICATE_SCORE_THRESHOLDS.review) return { outcome: "IGNORED" };

  const [primary, duplicate] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

  if (score >= DUPLICATE_SCORE_THRESHOLDS.autoMerge) {
    const duplicateRecord = await DuplicateRecordModel.create({
      workspaceId,
      recordType: "TENDER_BUYER",
      primaryRecordId: primary.id,
      duplicateRecordId: duplicate.id,
      duplicateScore: score,
      duplicateReason: reason,
      matchingFields,
      conflictingFields,
      status: "AUTO_MERGED",
    });
    await mergeRecords(workspaceId, "TENDER_BUYER", primary.id, duplicate.id, {
      mergedBy: null,
      mergeReason: reason,
      duplicateRecordId: duplicateRecord.id,
    });
    return { outcome: "AUTO_MERGED" };
  }

  await DuplicateRecordModel.create({
    workspaceId,
    recordType: "TENDER_BUYER",
    primaryRecordId: primary.id,
    duplicateRecordId: duplicate.id,
    duplicateScore: score,
    duplicateReason: reason,
    matchingFields,
    conflictingFields,
    status: "PENDING_REVIEW",
  });
  await TenderBuyerModel.updateMany(
    { _id: { $in: [primary.id, duplicate.id] }, duplicateStatus: "UNIQUE" },
    { duplicateStatus: "POSSIBLE_DUPLICATE" },
  );
  return { outcome: "PENDING_REVIEW" };
}

/**
 * Scans TenderBuyer records within one workspace only, comparing pairs for
 * likely duplicates. Bounded by DEDUP_SCAN_LIMIT (simple O(n^2) within that
 * cap) — fine at MVP scale. Mirrors runCustomerDeduplication/runProjectDeduplication.
 */
export async function runTenderBuyerDeduplication(
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

  const docs = await TenderBuyerModel.find(query).sort({ createdAt: 1 }).limit(DEDUP_SCAN_LIMIT);
  const candidates = docs.map((d) => d.toObject() as TenderBuyer);

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
        console.error(`Tender buyer deduplication failed comparing ${candidates[i].id} and ${candidates[j].id}:`, error);
        summary.errors += 1;
      }
    }
  }

  return summary;
}

export type CheckTenderBuyerForDuplicatesResult = { outcome: "AUTO_MERGED" | "PENDING_REVIEW" | "NONE" };

/**
 * Checks a single newly-created/updated tender buyer against other active
 * buyers in its workspace — triggered by the tender processor right after it
 * creates a buyer (see src/lib/tenders/processor.ts).
 */
export async function checkTenderBuyerForDuplicates(workspaceId: string, buyerId: string): Promise<CheckTenderBuyerForDuplicatesResult> {
  await dbConnect();

  const target = await TenderBuyerModel.findOne({ _id: buyerId, workspaceId });
  if (!target || target.duplicateStatus === "MERGED") return { outcome: "NONE" };

  const others = await TenderBuyerModel.find({
    workspaceId,
    _id: { $ne: buyerId },
    duplicateStatus: { $ne: "MERGED" },
  }).limit(DEDUP_SCAN_LIMIT);

  const targetPlain = target.toObject() as TenderBuyer;
  let best: CheckTenderBuyerForDuplicatesResult["outcome"] = "NONE";
  for (const otherDoc of others) {
    try {
      const result = await evaluatePair(workspaceId, targetPlain, otherDoc.toObject() as TenderBuyer);
      if (result.outcome === "AUTO_MERGED") return { outcome: "AUTO_MERGED" };
      if (result.outcome === "PENDING_REVIEW") best = "PENDING_REVIEW";
    } catch (error) {
      console.error(`Post-processing duplicate check failed for tender buyer ${buyerId}:`, error);
    }
  }
  return { outcome: best };
}
