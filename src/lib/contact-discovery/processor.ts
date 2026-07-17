import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  RawSearchResult as RawSearchResultModel,
  SearchQuery as SearchQueryModel,
  ContactDiscoveryTarget as ContactDiscoveryTargetModel,
  ContactExtractionRun as ContactExtractionRunModel,
} from "@/models";
import type { RawSearchResult, ContactRelatedRecordType } from "@/models";
import { extractPublicContactsAI } from "@/lib/ai-extraction";
import {
  createContact,
  addContactActivity,
  linkContactToTargetCustomer,
  linkContactToProject,
  linkContactToTenderBuyer,
  linkContactToTenderOpportunity,
  linkContactToVendorRegistration,
} from "@/lib/contacts/service";
import type { RelatedRecordType as ContactServiceRelatedRecordType } from "@/lib/contacts/service";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

/** contact-discovery's ContactRelatedRecordType (6 values, includes MANUAL_COMPANY) maps onto contacts/service's linking RelatedRecordType (5 values, no manual option) — MANUAL_COMPANY targets have nothing to link a discovered contact to. */
const LINK_FUNCTIONS: Partial<Record<ContactRelatedRecordType, (workspaceId: string, contactId: string, recordId: string) => Promise<unknown>>> = {
  TARGET_CUSTOMER: linkContactToTargetCustomer,
  PROJECT_OPPORTUNITY: linkContactToProject,
  TENDER_BUYER: linkContactToTenderBuyer,
  TENDER_OPPORTUNITY: linkContactToTenderOpportunity,
  VENDOR_REGISTRATION: linkContactToVendorRegistration,
};
void (0 as unknown as ContactServiceRelatedRecordType); // keeps the import referenced for the type-alias comment above without unused-import lint noise

export type ProcessContactResultsOptions = {
  batchSize?: number;
  /** Scope the batch to raw results whose originating query targeted this one ContactDiscoveryTarget. */
  contactDiscoveryTargetId?: string;
  discoveryRunId?: string;
};

export type ProcessContactResultsSummary = {
  rawResultsProcessed: number;
  contactsExtracted: number;
  contactsCreated: number;
  contactsUpdated: number;
  duplicatesFound: number;
  skipped: number;
  failed: number;
};

type ResolvedTarget = {
  id: string;
  relatedRecordType: ContactRelatedRecordType;
  relatedRecordId: string;
  companyName: string;
  companyWebsite: string;
  country: string;
};

/** Traces a RawSearchResult back to the ContactDiscoveryTarget its query was generated for, via the query's relatedRecordType/relatedRecordId (see models/SearchQuery.ts's docblock for why this indirection exists instead of a direct field on RawSearchResult). Returns null for a CONTACT query that wasn't target-driven (e.g. hand-run). */
async function resolveTargetForResult(workspaceId: string, result: RawSearchResult): Promise<ResolvedTarget | null> {
  const searchQuery = await SearchQueryModel.findOne({ _id: result.searchQueryId, workspaceId });
  if (!searchQuery?.relatedRecordType || !searchQuery.relatedRecordId) return null;

  const target = await ContactDiscoveryTargetModel.findOne({
    workspaceId,
    relatedRecordType: searchQuery.relatedRecordType,
    relatedRecordId: searchQuery.relatedRecordId,
  });

  return {
    id: target?.id ?? "",
    relatedRecordType: searchQuery.relatedRecordType as ContactRelatedRecordType,
    relatedRecordId: searchQuery.relatedRecordId as string,
    companyName: target?.companyName ?? (searchQuery.relatedCompanyName as string) ?? "",
    companyWebsite: target?.companyWebsite ?? "",
    country: target?.country ?? (searchQuery.country as string) ?? "",
  };
}

/**
 * Converts raw public-contact search results into Contact records. Reads
 * unprocessed RawSearchResult rows (searchType=CONTACT), extracts every
 * publicly-visible contact per result (0, 1, or several), then for each one:
 * creates-or-updates a Contact via the same dedup-aware
 * `createContact` used by manual entry, links it back to the originating
 * TargetCustomer/ProjectOpportunity/TenderBuyer/TenderOpportunity/
 * VendorRegistration when the raw result traces back to a
 * ContactDiscoveryTarget, and logs a VERIFICATION activity citing the
 * source URL. One bad result (failed extraction) is logged and skipped, not
 * allowed to abort the whole batch. Always records a ContactExtractionRun
 * row summarizing the batch.
 */
export async function processContactResults(workspaceId: string, options: ProcessContactResultsOptions = {}): Promise<ProcessContactResultsSummary> {
  await dbConnect();

  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE));

  const query: Record<string, unknown> = {
    workspaceId,
    searchType: "CONTACT",
    extractionStatus: { $ne: "EXTRACTED" },
    processedStatus: { $in: ["UNPROCESSED", "FAILED"] },
  };
  if (options.discoveryRunId) query.discoveryRunId = options.discoveryRunId;

  if (options.contactDiscoveryTargetId) {
    const target = await ContactDiscoveryTargetModel.findOne({ _id: options.contactDiscoveryTargetId, workspaceId });
    if (target) {
      const matchingQueries = await SearchQueryModel.find(
        { workspaceId, relatedRecordType: target.relatedRecordType, relatedRecordId: target.relatedRecordId },
        { _id: 1 },
      );
      query.searchQueryId = { $in: matchingQueries.map((q) => q.id as string) };
    }
  }

  const extractionRun = await ContactExtractionRunModel.create({
    workspaceId,
    contactDiscoveryTargetId: options.contactDiscoveryTargetId ?? null,
    discoveryRunId: options.discoveryRunId ?? null,
    status: "RUNNING",
    startedAt: new Date(),
  });

  const summary: ProcessContactResultsSummary = {
    rawResultsProcessed: 0,
    contactsExtracted: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    duplicatesFound: 0,
    skipped: 0,
    failed: 0,
  };

  const results = await RawSearchResultModel.find(query).sort({ retrievedAt: 1 }).limit(batchSize);
  const targetContactDeltas = new Map<string, number>();
  const errorMessages: string[] = [];

  for (const doc of results) {
    const result = doc.toObject() as RawSearchResult;
    doc.processedStatus = "PROCESSING";
    doc.extractionStatus = "PENDING";
    await doc.save();

    const resolvedTarget = await resolveTargetForResult(workspaceId, result);

    let extraction;
    try {
      extraction = await extractPublicContactsAI(result, {
        companyName: resolvedTarget?.companyName ?? "",
        companyWebsite: resolvedTarget?.companyWebsite ?? "",
        country: resolvedTarget?.country ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error extracting public contacts.";
      console.error(`Public contact extraction failed for RawSearchResult ${result.id}:`, error);
      errorMessages.push(message);
      doc.processedStatus = "FAILED";
      doc.extractionStatus = "FAILED";
      await doc.save();
      summary.failed += 1;
      continue;
    }

    summary.rawResultsProcessed += 1;

    if (!extraction.isRelevant || extraction.contacts.length === 0) {
      doc.processedStatus = "PROCESSED";
      doc.extractionStatus = "SKIPPED";
      await doc.save();
      summary.skipped += 1;
      continue;
    }

    let createdAny = false;
    for (const candidate of extraction.contacts) {
      try {
        const { contact, outcome } = await createContact(workspaceId, {
          fullName: candidate.fullName || candidate.designation || candidate.department,
          companyName: candidate.companyName || resolvedTarget?.companyName,
          companyWebsite: candidate.companyWebsite || resolvedTarget?.companyWebsite,
          designation: candidate.designation,
          department: candidate.department,
          roleCategory: candidate.roleCategory !== "OTHER" ? candidate.roleCategory : undefined,
          seniority: candidate.seniority !== "UNKNOWN" ? candidate.seniority : undefined,
          email: candidate.email,
          phoneNumber: candidate.phoneNumber,
          mobileNumber: candidate.mobileNumber,
          linkedinUrl: candidate.linkedinUrl,
          country: candidate.country || resolvedTarget?.country,
          location: candidate.location,
          sourceUrl: candidate.sourceUrl || result.url,
          sourceType: candidate.sourceType,
          confidenceScore: candidate.confidenceScore,
        });

        summary.contactsExtracted += 1;
        if (outcome === "CREATED") summary.contactsCreated += 1;
        else {
          summary.contactsUpdated += 1;
          summary.duplicatesFound += 1;
        }

        if (resolvedTarget?.relatedRecordId) {
          const linkFn = LINK_FUNCTIONS[resolvedTarget.relatedRecordType];
          if (linkFn) {
            try {
              await linkFn(workspaceId, contact.id, resolvedTarget.relatedRecordId);
            } catch (linkError) {
              console.error(`Failed to link contact ${contact.id} to ${resolvedTarget.relatedRecordType}:`, linkError);
            }
          }
          if (resolvedTarget.id) {
            targetContactDeltas.set(resolvedTarget.id, (targetContactDeltas.get(resolvedTarget.id) ?? 0) + 1);
          }
        }

        try {
          await addContactActivity(workspaceId, contact.id, {
            activityType: outcome === "CREATED" ? "VERIFICATION" : "MANUAL_UPDATE",
            title: outcome === "CREATED" ? "Discovered via public search" : "Re-confirmed via public search",
            description: `Source: ${result.url}`,
          });
        } catch (activityError) {
          console.error(`Failed to log activity for contact ${contact.id}:`, activityError);
        }

        createdAny = true;
      } catch (error) {
        console.error(`Failed to create/update Contact from candidate on RawSearchResult ${result.id}:`, error);
        summary.failed += 1;
      }
    }

    if (resolvedTarget?.id && !targetContactDeltas.has(resolvedTarget.id)) {
      targetContactDeltas.set(resolvedTarget.id, 0);
    }
    void createdAny;

    doc.processedStatus = "PROCESSED";
    doc.extractionStatus = "EXTRACTED";
    await doc.save();
  }

  for (const [targetId, delta] of targetContactDeltas) {
    const target = await ContactDiscoveryTargetModel.findOne({ _id: targetId, workspaceId });
    if (!target) continue;
    target.contactsFound += delta;
    target.lastSearchedAt = new Date();
    target.status = target.contactsFound > 0 ? "CONTACTS_FOUND" : "NO_CONTACTS_FOUND";
    await target.save();
  }

  await ContactExtractionRunModel.updateOne(
    { _id: extractionRun.id },
    {
      status: summary.failed > 0 && summary.rawResultsProcessed === 0 ? "FAILED" : "COMPLETED",
      rawResultsProcessed: summary.rawResultsProcessed,
      contactsExtracted: summary.contactsExtracted,
      contactsCreated: summary.contactsCreated,
      contactsUpdated: summary.contactsUpdated,
      skipped: summary.skipped,
      failed: summary.failed,
      finishedAt: new Date(),
      errorSummary: errorMessages.length > 0 ? errorMessages.slice(0, 5).join("; ") : null,
    },
  );

  return summary;
}
