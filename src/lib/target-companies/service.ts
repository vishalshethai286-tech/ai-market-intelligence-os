import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TargetCompany as TargetCompanyModel } from "@/models";
import { search } from "@/lib/search";
import type { SearchProviderName } from "@/lib/search";
import { listSearchQueries } from "@/lib/search-queries/service";
import { getBusinessBrain, listBrainFacts, BrainNotReadyError } from "@/lib/business-brain/service";
import { extractTargetCompaniesAI } from "@/lib/ai-extraction";
import { isJsonId, newJsonId, readCollection, writeCollection } from "@/lib/json-store";
import { TargetExtractionError } from "./extract";
import { MAX_RESULTS_PER_EXTRACTION_BATCH } from "./constants";
import type { TargetExtractionContext } from "./prompt";
import type { BrainFact, BrainFactType, TargetCompany, TargetCompanyDuplicateStatus } from "@/models";

export { BrainNotReadyError, TargetExtractionError };
export class NoSearchQueriesError extends Error {}
export class TargetCompanyNotFoundError extends Error {}

const JSON_COLLECTION = "target-companies";

/**
 * Manually-added target companies are stored as plain JSON under
 * data/target-companies.json instead of MongoDB (same MVP decision as
 * product-discovery's manual-add — see the comment there). AI-discovered
 * targets (discoverAndExtractTargetCompanies) are unaffected and stay in
 * MongoDB, since lead-scoring reads those directly. Reads merge both
 * stores; writes route to whichever store owns the id.
 */
type JsonTargetCompany = {
  id: string;
  workspaceId: string;
  companyName: string;
  website: string | null;
  country: string | null;
  cityState: string | null;
  industry: string | null;
  companyDescription: string | null;
  buyerType: string | null;
  matchedProduct: string | null;
  sourceUrl: string | null;
  relevanceExplanation: string | null;
  confidenceScore: number;
  priorityScore: number;
  priorityGrade: "A_PLUS" | "A" | "B" | "C" | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  duplicateStatus: "UNIQUE" | "DUPLICATE" | "POSSIBLE_DUPLICATE";
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toTargetCompany(row: JsonTargetCompany): TargetCompany {
  return {
    ...row,
    lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  } as TargetCompany;
}

async function readJsonTargetCompanies(workspaceId: string): Promise<TargetCompany[]> {
  const rows = await readCollection<JsonTargetCompany>(JSON_COLLECTION);
  return rows.filter((row) => row.workspaceId === workspaceId).map(toTargetCompany);
}

/** Reads the full JSON collection, patches the row matching id/workspaceId, writes it back, and returns it. */
async function patchJsonTargetCompany(
  workspaceId: string,
  id: string,
  patch: Partial<JsonTargetCompany>,
): Promise<TargetCompany> {
  const rows = await readCollection<JsonTargetCompany>(JSON_COLLECTION);
  const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);
  if (index === -1) {
    throw new TargetCompanyNotFoundError("That target company doesn't exist in this workspace.");
  }
  rows[index] = { ...rows[index], ...patch, updatedAt: new Date().toISOString() };
  await writeCollection(JSON_COLLECTION, rows);
  return toTargetCompany(rows[index]);
}

export type TargetCompanyEditableFields = {
  companyName: string;
  website: string;
  country: string;
  cityState: string;
  industry: string;
  companyDescription: string;
  buyerType: string;
  matchedProduct: string;
};

/**
 * Adds a manually-created target company — a human asserting a lead exists,
 * not an AI discovery. Starts PENDING_REVIEW like an AI-discovered target so
 * it still goes through the same approve/reject review step. Stored as JSON,
 * not MongoDB — see the JsonTargetCompany comment above.
 */
export async function createTargetCompany(
  workspaceId: string,
  fields: TargetCompanyEditableFields,
): Promise<TargetCompany> {
  const now = new Date().toISOString();
  const row: JsonTargetCompany = {
    id: newJsonId(),
    workspaceId,
    companyName: fields.companyName,
    website: fields.website || null,
    country: fields.country || null,
    cityState: fields.cityState || null,
    industry: fields.industry || null,
    companyDescription: fields.companyDescription || null,
    buyerType: fields.buyerType || null,
    matchedProduct: fields.matchedProduct || null,
    sourceUrl: null,
    relevanceExplanation: null,
    confidenceScore: 1,
    priorityScore: 0,
    priorityGrade: null,
    status: "PENDING_REVIEW",
    duplicateStatus: "UNIQUE",
    lastVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const rows = await readCollection<JsonTargetCompany>(JSON_COLLECTION);
  rows.push(row);
  await writeCollection(JSON_COLLECTION, rows);
  return toTargetCompany(row);
}

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

/** Best-effort hostname extraction, tolerant of a bare domain with no scheme. */
function domainFromLooseUrl(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Same-company key: prefer the website's domain, fall back to the company name. */
function normalizeKey(companyName: string, website: string): string {
  const domain = website ? domainFromLooseUrl(website) : "";
  return (domain || companyName).trim().toLowerCase();
}

export async function listTargetCompanies(workspaceId: string): Promise<TargetCompany[]> {
  await dbConnect();
  const [dbRows, jsonRows] = await Promise.all([
    TargetCompanyModel.find({ workspaceId }).then((rows) => rows.map((r) => r.toObject() as TargetCompany)),
    readJsonTargetCompanies(workspaceId),
  ]);

  return [...dbRows, ...jsonRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type TargetDiscoveryOptions = {
  provider?: SearchProviderName;
  maxResultsPerQuery?: number;
  maxQueries?: number;
};

export type TargetDiscoveryResult = { evaluated: number; created: number; queriesRun: number };

/**
 * Runs every stored SearchQuery for a workspace through the Search Service,
 * assesses each batch of results with Claude (`extractTargetCompanies`), and
 * saves only the companies judged relevant as TargetCompany rows
 * (PENDING_REVIEW, matching the CompanyProfile/ProductService review-gated
 * pattern). A company matching an existing TargetCompany (by website domain,
 * or company name if no website) is still saved but flagged `DUPLICATE`
 * rather than dropped — a human reviewing the queue decides what to do with
 * repeats, this doesn't silently discard a second source for the same lead.
 *
 * A single bad query or failed extraction batch is skipped rather than
 * aborting the whole run — with potentially dozens of queries, one provider
 * hiccup or refusal shouldn't lose everything already found.
 */
export async function discoverAndExtractTargetCompanies(
  workspaceId: string,
  options: TargetDiscoveryOptions = {},
): Promise<TargetDiscoveryResult> {
  const brain = await getBusinessBrain(workspaceId);
  if (!brain || brain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before discovering target companies.");
  }

  await dbConnect();
  const [facts, queries, existingDbRows, existingJsonRows] = await Promise.all([
    listBrainFacts(workspaceId),
    listSearchQueries(workspaceId),
    TargetCompanyModel.find({ workspaceId }, { companyName: 1, website: 1 }),
    readJsonTargetCompanies(workspaceId),
  ]);
  const existing = [...existingDbRows, ...existingJsonRows];

  if (queries.length === 0) {
    throw new NoSearchQueriesError("Generate search queries before discovering target companies.");
  }

  const context: TargetExtractionContext = {
    companyName: factValues(facts, "COMPANY_NAME")[0] ?? "",
    industry: factValues(facts, "INDUSTRY")[0] ?? "",
    businessDescription: factValues(facts, "BUSINESS_DESCRIPTION")[0] ?? "",
    products: factValues(facts, "PRODUCT_OR_SERVICE"),
    targetIndustries: factValues(facts, "TARGET_INDUSTRY"),
    buyerTypes: factValues(facts, "BUYER_TYPE"),
    countriesServed: factValues(facts, "COUNTRY_SERVED"),
    keywords: factValues(facts, "KEYWORD"),
    competitors: factValues(facts, "COMPETITOR"),
  };

  const seenKeys = new Set(existing.map((e) => normalizeKey(e.companyName, e.website ?? "")));

  const maxResultsPerQuery = Math.min(
    options.maxResultsPerQuery ?? MAX_RESULTS_PER_EXTRACTION_BATCH,
    MAX_RESULTS_PER_EXTRACTION_BATCH,
  );
  const queriesToRun = options.maxQueries ? queries.slice(0, options.maxQueries) : queries;

  let evaluated = 0;
  let created = 0;
  let queriesRun = 0;

  for (const query of queriesToRun) {
    let results;
    try {
      results = await search(query.query, { provider: options.provider, maxResults: maxResultsPerQuery });
    } catch {
      continue;
    }
    if (results.length === 0) continue;

    let assessments;
    try {
      assessments = await extractTargetCompaniesAI(results, context, context.products);
    } catch {
      continue;
    }

    queriesRun += 1;
    evaluated += assessments.length;

    for (let i = 0; i < assessments.length && i < results.length; i++) {
      const item = assessments[i];
      if (!item.isRelevantTarget || !item.companyName) continue;

      const key = normalizeKey(item.companyName, item.website);
      const duplicateStatus: TargetCompanyDuplicateStatus = seenKeys.has(key) ? "DUPLICATE" : "UNIQUE";
      seenKeys.add(key);

      await TargetCompanyModel.create({
        workspaceId,
        companyName: item.companyName,
        website: item.website || null,
        industry: item.industry || null,
        country: item.country || null,
        matchedProduct: item.matchedProduct || null,
        sourceUrl: results[i].url,
        relevanceExplanation: item.relevanceExplanation || null,
        confidenceScore: item.confidenceScore,
        duplicateStatus,
      });
      created += 1;
    }
  }

  return { evaluated, created, queriesRun };
}

/** Ownership-checked read — never trust an id alone across workspace boundaries. */
async function requireOwnedTargetCompany(workspaceId: string, id: string) {
  if (isJsonId(id)) {
    const rows = await readCollection<JsonTargetCompany>(JSON_COLLECTION);
    const existing = rows.find((row) => row.id === id && row.workspaceId === workspaceId);
    if (!existing) {
      throw new TargetCompanyNotFoundError("That target company doesn't exist in this workspace.");
    }
    return existing;
  }

  await dbConnect();
  const existing = await TargetCompanyModel.findOne({ _id: id, workspaceId });
  if (!existing) {
    throw new TargetCompanyNotFoundError("That target company doesn't exist in this workspace.");
  }
  return existing;
}

export async function approveTargetCompany(workspaceId: string, id: string) {
  await requireOwnedTargetCompany(workspaceId, id);

  if (isJsonId(id)) {
    return patchJsonTargetCompany(workspaceId, id, {
      status: "APPROVED",
      lastVerifiedAt: new Date().toISOString(),
    });
  }

  await TargetCompanyModel.updateOne({ _id: id }, { status: "APPROVED", lastVerifiedAt: new Date() });
  return TargetCompanyModel.findById(id);
}

export async function rejectTargetCompany(workspaceId: string, id: string) {
  await requireOwnedTargetCompany(workspaceId, id);

  if (isJsonId(id)) {
    return patchJsonTargetCompany(workspaceId, id, { status: "REJECTED" });
  }

  await TargetCompanyModel.updateOne({ _id: id }, { status: "REJECTED" });
  return TargetCompanyModel.findById(id);
}

export async function deleteTargetCompany(workspaceId: string, id: string) {
  await requireOwnedTargetCompany(workspaceId, id);

  if (isJsonId(id)) {
    const rows = await readCollection<JsonTargetCompany>(JSON_COLLECTION);
    const filtered = rows.filter((row) => !(row.id === id && row.workspaceId === workspaceId));
    await writeCollection(JSON_COLLECTION, filtered);
    return;
  }

  await TargetCompanyModel.deleteOne({ _id: id });
}
