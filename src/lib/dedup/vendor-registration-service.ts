import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { VendorRegistration as VendorRegistrationModel, DuplicateRecord as DuplicateRecordModel } from "@/models";
import type { VendorRegistration } from "@/models";
import { calculateVendorRegistrationDuplicateScore } from "./scoring";
import type { VendorRegistrationDuplicateCandidate } from "./scoring";
import { mergeRecords } from "./merge";
import { pairAlreadyRecorded } from "./service";
import { DUPLICATE_SCORE_THRESHOLDS, DEDUP_SCAN_LIMIT } from "./constants";
import type { DeduplicationMode, RunDeduplicationSummary } from "./customer-service";

function toCandidate(registration: VendorRegistration): VendorRegistrationDuplicateCandidate {
  return {
    customerName: registration.customerName,
    country: registration.country ?? "",
    websiteDomain: registration.websiteDomain ?? "",
    vendorRegistrationLink: registration.vendorRegistrationLink ?? "",
    phoneNumber: registration.phoneNumber ?? "",
    sourceUrl: registration.sourceUrl ?? "",
  };
}

/**
 * Scores one candidate pair and, depending on the score, either auto-merges
 * (>=95), records a PENDING_REVIEW DuplicateRecord for a human to decide
 * (75-94), or does nothing (<75). Shared by both the full workspace scan and
 * the single-record check the vendor registration processor triggers after
 * creating a new registration. Mirrors src/lib/dedup/tender-buyer-service.ts's evaluatePair.
 */
async function evaluatePair(
  workspaceId: string,
  a: VendorRegistration,
  b: VendorRegistration,
): Promise<{ outcome: "AUTO_MERGED" | "PENDING_REVIEW" | "IGNORED" | "ALREADY_RECORDED" }> {
  if (a.duplicateStatus === "MERGED" || b.duplicateStatus === "MERGED") return { outcome: "IGNORED" };
  if (await pairAlreadyRecorded(workspaceId, "VENDOR_REGISTRATION", a.id, b.id)) return { outcome: "ALREADY_RECORDED" };

  const { score, matchingFields, conflictingFields, reason } = calculateVendorRegistrationDuplicateScore(toCandidate(a), toCandidate(b));
  if (score < DUPLICATE_SCORE_THRESHOLDS.review) return { outcome: "IGNORED" };

  const [primary, duplicate] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

  if (score >= DUPLICATE_SCORE_THRESHOLDS.autoMerge) {
    const duplicateRecord = await DuplicateRecordModel.create({
      workspaceId,
      recordType: "VENDOR_REGISTRATION",
      primaryRecordId: primary.id,
      duplicateRecordId: duplicate.id,
      duplicateScore: score,
      duplicateReason: reason,
      matchingFields,
      conflictingFields,
      status: "AUTO_MERGED",
    });
    await mergeRecords(workspaceId, "VENDOR_REGISTRATION", primary.id, duplicate.id, {
      mergedBy: null,
      mergeReason: reason,
      duplicateRecordId: duplicateRecord.id,
    });
    return { outcome: "AUTO_MERGED" };
  }

  await DuplicateRecordModel.create({
    workspaceId,
    recordType: "VENDOR_REGISTRATION",
    primaryRecordId: primary.id,
    duplicateRecordId: duplicate.id,
    duplicateScore: score,
    duplicateReason: reason,
    matchingFields,
    conflictingFields,
    status: "PENDING_REVIEW",
  });
  await VendorRegistrationModel.updateMany(
    { _id: { $in: [primary.id, duplicate.id] }, duplicateStatus: "UNIQUE" },
    { duplicateStatus: "POSSIBLE_DUPLICATE" },
  );
  return { outcome: "PENDING_REVIEW" };
}

/**
 * Scans VendorRegistration records within one workspace only, comparing
 * pairs for likely duplicates. Bounded by DEDUP_SCAN_LIMIT (simple O(n^2)
 * within that cap) — fine at MVP scale. Mirrors runTenderBuyerDeduplication.
 */
export async function runVendorRegistrationDeduplication(
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

  const docs = await VendorRegistrationModel.find(query).sort({ createdAt: 1 }).limit(DEDUP_SCAN_LIMIT);
  const candidates = docs.map((d) => d.toObject() as VendorRegistration);

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
        console.error(`Vendor registration deduplication failed comparing ${candidates[i].id} and ${candidates[j].id}:`, error);
        summary.errors += 1;
      }
    }
  }

  return summary;
}

export type CheckVendorRegistrationForDuplicatesResult = { outcome: "AUTO_MERGED" | "PENDING_REVIEW" | "NONE" };

/**
 * Checks a single newly-created/updated vendor registration against other
 * active registrations in its workspace — triggered by the vendor
 * registration processor right after it creates one (see
 * src/lib/vendor-registrations/processor.ts).
 */
export async function checkVendorRegistrationForDuplicates(
  workspaceId: string,
  registrationId: string,
): Promise<CheckVendorRegistrationForDuplicatesResult> {
  await dbConnect();

  const target = await VendorRegistrationModel.findOne({ _id: registrationId, workspaceId });
  if (!target || target.duplicateStatus === "MERGED") return { outcome: "NONE" };

  const others = await VendorRegistrationModel.find({
    workspaceId,
    _id: { $ne: registrationId },
    duplicateStatus: { $ne: "MERGED" },
  }).limit(DEDUP_SCAN_LIMIT);

  const targetPlain = target.toObject() as VendorRegistration;
  let best: CheckVendorRegistrationForDuplicatesResult["outcome"] = "NONE";
  for (const otherDoc of others) {
    try {
      const result = await evaluatePair(workspaceId, targetPlain, otherDoc.toObject() as VendorRegistration);
      if (result.outcome === "AUTO_MERGED") return { outcome: "AUTO_MERGED" };
      if (result.outcome === "PENDING_REVIEW") best = "PENDING_REVIEW";
    } catch (error) {
      console.error(`Post-processing duplicate check failed for vendor registration ${registrationId}:`, error);
    }
  }
  return { outcome: best };
}
