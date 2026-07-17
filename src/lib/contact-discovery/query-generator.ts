import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { SearchQuery as SearchQueryModel, SearchQueueItem as SearchQueueItemModel, ContactDiscoveryTarget as ContactDiscoveryTargetModel } from "@/models";
import { getBusinessBrain, BrainNotReadyError } from "@/lib/business-brain/service";
import type { ContactDiscoveryTargetPriority } from "@/models";

export { BrainNotReadyError };

const PRIORITY_TO_NUMBER: Record<ContactDiscoveryTargetPriority, number> = { A_PLUS: 3, A: 2, B: 1, C: 0 };

/**
 * Query templates for public contact discovery. Deliberately excludes any
 * LinkedIn-targeted query (no `site:linkedin.com`, no "linkedin" keyword) and
 * anything that would try to bypass a login/privacy wall — every template
 * here searches for a *public* page a search engine can already see.
 */
function buildCompanyQueries(company: string): string[] {
  return [
    // Procurement / purchase
    `${company} procurement contact`,
    `${company} purchase manager`,
    `${company} purchasing department`,
    `${company} sourcing manager`,
    `${company} supply chain contact`,
    `${company} procurement email`,
    // Vendor / supplier
    `${company} vendor registration contact`,
    `${company} supplier registration contact`,
    `${company} supplier portal contact`,
    `${company} procurement portal contact`,
    `${company} vendor management contact`,
    `${company} supplier onboarding contact`,
    // Project / technical
    `${company} project manager`,
    `${company} engineering manager`,
    `${company} maintenance manager`,
    `${company} plant manager`,
    `${company} operations manager`,
    `${company} contracts manager`,
    // Tender specific
    `${company} tender contact`,
    `${company} contracts department`,
    `${company} bid contact`,
    `${company} procurement tender contact`,
  ];
}

function buildDomainQueries(domain: string): string[] {
  return [
    `site:${domain} procurement`,
    `site:${domain} purchasing`,
    `site:${domain} supplier`,
    `site:${domain} vendor`,
    `site:${domain} contact`,
    `site:${domain} team`,
    `site:${domain} management`,
    `site:${domain} PDF procurement contact`,
  ];
}

/** All queries for one target — 22 company-name queries, plus 8 more `site:domain` queries when a domain is known (30 total). */
export function buildContactQueriesForTarget(companyName: string, companyDomain: string | null): string[] {
  const queries = buildCompanyQueries(companyName);
  if (companyDomain) queries.push(...buildDomainQueries(companyDomain));
  return queries;
}

export type GenerateContactSearchQueueSummary = {
  queriesCreated: number;
  queueItemsCreated: number;
  duplicatesSkipped: number;
};

/**
 * Generates CONTACT-searchType SearchQuery + SearchQueueItem rows for every
 * not-yet-queued ContactDiscoveryTarget (NEW or previously-searched-but-worth-
 * retrying targets — everything except ARCHIVED). Existing query text is
 * never duplicated (same unique-query-per-workspace guarantee
 * generateDiscoveryQueue relies on). Marks each processed target QUEUED with
 * a fresh lastQueuedAt.
 */
export async function generateContactSearchQueue(workspaceId: string): Promise<GenerateContactSearchQueueSummary> {
  await dbConnect();

  const businessBrain = await getBusinessBrain(workspaceId);
  if (!businessBrain || businessBrain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before generating a contact search queue.");
  }

  const summary: GenerateContactSearchQueueSummary = { queriesCreated: 0, queueItemsCreated: 0, duplicatesSkipped: 0 };

  const targets = await ContactDiscoveryTargetModel.find({ workspaceId, status: { $ne: "ARCHIVED" } });
  if (targets.length === 0) return summary;

  for (const target of targets) {
    const queries = buildContactQueriesForTarget(target.companyName, target.companyDomain ?? null);

    const existing = await SearchQueryModel.find({ workspaceId, query: { $in: queries } }, { query: 1 });
    const seen = new Set(existing.map((r) => r.query as string));

    const toInsert = queries.filter((q) => {
      if (seen.has(q)) return false;
      seen.add(q);
      return true;
    });
    summary.duplicatesSkipped += queries.length - toInsert.length;

    if (toInsert.length > 0) {
      const inserted = await SearchQueryModel.insertMany(
        toInsert.map((query) => ({
          workspaceId,
          brainId: businessBrain.id,
          query,
          searchType: "CONTACT",
          country: target.country,
          priority: PRIORITY_TO_NUMBER[target.priority as ContactDiscoveryTargetPriority] ?? 0,
          status: "QUEUED",
          relatedRecordType: target.relatedRecordType,
          relatedRecordId: target.relatedRecordId,
          relatedCompanyName: target.companyName,
          relatedCompanyDomain: target.companyDomain ?? null,
        })),
        { ordered: false },
      );
      summary.queriesCreated += inserted.length;

      const queueItems = await SearchQueueItemModel.insertMany(
        inserted.map((q) => ({
          workspaceId,
          searchQueryId: q.id,
          searchType: "CONTACT",
          priority: PRIORITY_TO_NUMBER[target.priority as ContactDiscoveryTargetPriority] ?? 0,
          status: "QUEUED",
        })),
        { ordered: false },
      );
      summary.queueItemsCreated += queueItems.length;
    }

    target.status = "QUEUED";
    target.lastQueuedAt = new Date();
    await target.save();
  }

  return summary;
}
