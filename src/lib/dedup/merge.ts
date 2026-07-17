import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
  MergeHistory as MergeHistoryModel,
  SourceHistory as SourceHistoryModel,
  DuplicateRecord as DuplicateRecordModel,
} from "@/models";
import type { DedupRecordType } from "@/models";

export class MergeTargetNotFoundError extends Error {}
export class UnsupportedRecordTypeError extends Error {}

/** Which Mongoose model backs each recordType — every DedupRecordType now has a real model, as of Phase 11's VendorRegistration pipeline. */
const RECORD_MODELS: Partial<Record<DedupRecordType, typeof TargetCustomerModel>> = {
  CUSTOMER: TargetCustomerModel,
  PROJECT: ProjectOpportunityModel,
  TENDER_BUYER: TenderBuyerModel,
  TENDER_OPPORTUNITY: TenderOpportunityModel,
  VENDOR_REGISTRATION: VendorRegistrationModel,
};

export function getRecordModel(recordType: DedupRecordType) {
  const recordModel = RECORD_MODELS[recordType];
  if (!recordModel) {
    throw new UnsupportedRecordTypeError(`No model registered for recordType ${recordType} yet.`);
  }
  return recordModel;
}

/** Fields copied from the duplicate onto the primary only when the primary's own value is empty — never overwrites a real value with another real value. Differs per recordType; every other field (score/priority/confidenceScore/sourceHistory/duplicateStatus) is handled generically below since both models share that shape. */
const FILL_IF_EMPTY_FIELDS_BY_TYPE: Partial<Record<DedupRecordType, readonly string[]>> = {
  CUSTOMER: [
    "country",
    "website",
    "websiteDomain",
    "address",
    "phoneNumber",
    "matchedProductServiceId",
    "matchedProductServiceName",
    "matchedIndustry",
    "buyerType",
    "aiRelevanceExplanation",
  ],
  PROJECT: [
    "location",
    "country",
    "contractorName",
    "timeline",
    "projectInformationLink",
    "industry",
    "matchedProductServiceId",
    "matchedProductServiceName",
    "aiOpportunityExplanation",
  ],
  TENDER_BUYER: ["country", "address", "phoneNumber", "website", "websiteDomain", "tenderWebsiteLink"],
  TENDER_OPPORTUNITY: [
    "customerName",
    "tenderDescription",
    "startDate",
    "endDate",
    "tenderLink",
    "country",
    "matchedProductServiceId",
    "matchedProductServiceName",
  ],
  VENDOR_REGISTRATION: [
    "country",
    "address",
    "phoneNumber",
    "website",
    "websiteDomain",
    "vendorRegistrationLink",
    "registrationType",
    "matchedProductServiceId",
    "matchedProductServiceName",
  ],
};

export type MergeRecordsOptions = {
  /** null for an automatic (system) merge, a real userId for a manual merge. */
  mergedBy: string | null;
  mergeReason: string;
  /** If resolving a specific DuplicateRecord (manual merge flow), its id + the status to set on it. */
  duplicateRecordId?: string;
  duplicateRecordStatus?: "AUTO_MERGED" | "MANUALLY_MERGED";
};

export type MergeRecordsResult = {
  primaryId: string;
  mergedId: string;
  mergedFields: string[];
};

/**
 * Safely merges `duplicateId` into `primaryId` for any supported recordType:
 * never deletes either row — the duplicate is marked duplicateStatus=
 * "MERGED", the primary is updated in place, and every changed field is
 * logged to SourceHistory before being overwritten. All of the duplicate's
 * sourceHistory entries (raw-result provenance) are preserved on the
 * primary. Writes one MergeHistory row as the audit trail for this merge.
 * Works generically across TargetCustomer/ProjectOpportunity since both
 * share the same score/priority/confidenceScore/sourceHistory/
 * duplicateStatus shape — only the "which fields can be filled in" list
 * differs (FILL_IF_EMPTY_FIELDS_BY_TYPE above).
 */
export async function mergeRecords(
  workspaceId: string,
  recordType: DedupRecordType,
  primaryId: string,
  duplicateId: string,
  options: MergeRecordsOptions,
): Promise<MergeRecordsResult> {
  await dbConnect();
  const Model = getRecordModel(recordType);
  const fillIfEmptyFields = FILL_IF_EMPTY_FIELDS_BY_TYPE[recordType] ?? [];

  const [primary, duplicate] = await Promise.all([
    Model.findOne({ _id: primaryId, workspaceId }),
    Model.findOne({ _id: duplicateId, workspaceId }),
  ]);
  if (!primary || !duplicate) {
    throw new MergeTargetNotFoundError("One or both records don't exist in this workspace.");
  }

  const capturedAt = new Date();
  const mergedFields: string[] = [];

  for (const field of fillIfEmptyFields) {
    const primaryValue = primary.get(field) as string | null;
    const duplicateValue = duplicate.get(field) as string | null;
    if (!duplicateValue) continue;

    if (!primaryValue) {
      await SourceHistoryModel.create({
        workspaceId,
        recordType,
        recordId: primary.id,
        fieldName: field,
        oldValue: primaryValue ?? "",
        newValue: duplicateValue,
        sourceUrl: duplicate.sourceUrl ?? null,
        confidenceScore: duplicate.confidenceScore,
        capturedAt,
      });
      primary.set(field, duplicateValue);
      mergedFields.push(field);
    } else if (primaryValue !== duplicateValue) {
      // Conflict — both are real values that disagree. Preserve both sides in
      // SourceHistory for a human to review later; keep the primary's current
      // value rather than silently picking one.
      await SourceHistoryModel.create({
        workspaceId,
        recordType,
        recordId: primary.id,
        fieldName: field,
        oldValue: primaryValue,
        newValue: duplicateValue,
        sourceUrl: duplicate.sourceUrl ?? null,
        confidenceScore: duplicate.confidenceScore,
        capturedAt,
      });
    }
  }

  // TenderBuyer has no score/priority/confidenceScore fields (buyers aren't
  // scored, only tender opportunities are) — guarded so this is a harmless
  // no-op for models that don't define them, instead of assigning NaN.
  if (typeof primary.score === "number" && typeof duplicate.score === "number" && duplicate.score > primary.score) {
    primary.score = duplicate.score;
    primary.priority = duplicate.priority;
    mergedFields.push("score");
  }
  if (typeof primary.confidenceScore === "number" || typeof duplicate.confidenceScore === "number") {
    primary.confidenceScore = Math.max(primary.confidenceScore ?? 0, duplicate.confidenceScore ?? 0);
  }

  const existingSourceKeys = new Set(primary.sourceHistory.map((entry: { rawSearchResultId: string }) => entry.rawSearchResultId));
  const newSources = duplicate.sourceHistory.filter((entry: { rawSearchResultId: string }) => !existingSourceKeys.has(entry.rawSearchResultId));
  primary.sourceHistory = [...primary.sourceHistory, ...newSources];
  primary.lastVerifiedAt = capturedAt;

  const otherPendingCount = await DuplicateRecordModel.countDocuments({
    workspaceId,
    recordType,
    status: "PENDING_REVIEW",
    _id: { $ne: options.duplicateRecordId },
    $or: [{ primaryRecordId: primary.id }, { duplicateRecordId: primary.id }],
  });
  primary.duplicateStatus = otherPendingCount > 0 ? "POSSIBLE_DUPLICATE" : "UNIQUE";
  await primary.save();

  duplicate.duplicateStatus = "MERGED";
  await duplicate.save();

  const preservedSources = duplicate.sourceHistory.map((entry: { url: string }) => entry.url);
  await MergeHistoryModel.create({
    workspaceId,
    recordType,
    primaryRecordId: primary.id,
    mergedRecordId: duplicate.id,
    mergeReason: options.mergeReason,
    mergedFields,
    preservedSources,
    mergedBy: options.mergedBy,
    mergedAt: capturedAt,
  });

  if (options.duplicateRecordId && options.duplicateRecordStatus) {
    await DuplicateRecordModel.updateOne({ _id: options.duplicateRecordId, workspaceId }, { status: options.duplicateRecordStatus });
  }

  return { primaryId: primary.id, mergedId: duplicate.id, mergedFields };
}
