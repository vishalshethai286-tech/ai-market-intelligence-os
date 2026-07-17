import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { SearchQuery as SearchQueryModel } from "@/models";
import { getBusinessBrain, listBrainFacts, BrainNotReadyError } from "@/lib/business-brain/service";
import { generateSearchQueriesAI } from "@/lib/ai-extraction";
import { QUERY_CATEGORIES } from "./constants";
import type { QueryGeneratorContext } from "./prompt";
import type { BrainFact, BrainFactType, SearchQuery } from "@/models";

export { BrainNotReadyError };
export class InsufficientBrainContextError extends Error {}

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

export async function listSearchQueries(workspaceId: string): Promise<SearchQuery[]> {
  await dbConnect();
  const rows = await SearchQueryModel.find({ workspaceId }).sort({ category: 1, createdAt: -1 });
  return rows.map((r) => r.toObject() as SearchQuery);
}

/**
 * Generates candidate search queries across all 7 categories in
 * QUERY_CATEGORIES, grounded in the workspace's current Business Brain
 * facts, and stores them as SearchQuery rows. Deduped against past runs (and
 * within this same batch) by `workspaceId`+`query` before inserting — this is
 * this Mongoose model's equivalent of Prisma's `createMany`'s
 * `skipDuplicates`, which silently skipped any exact-string repeat rather
 * than erroring, so regenerating is safe to call repeatedly.
 */
export async function generateAndStoreSearchQueries(workspaceId: string) {
  const brain = await getBusinessBrain(workspaceId);
  if (!brain || brain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before generating search queries.");
  }

  await dbConnect();
  const facts = await listBrainFacts(workspaceId);

  const context: QueryGeneratorContext = {
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

  const hasEnoughContext = Boolean(context.companyName) || context.products.length > 0 || context.targetIndustries.length > 0;
  if (!hasEnoughContext) {
    throw new InsufficientBrainContextError(
      "This workspace's Business Brain doesn't have enough information yet to generate search queries.",
    );
  }

  const generated = await generateSearchQueriesAI(context);

  const rows = QUERY_CATEGORIES.flatMap(({ key, category }) =>
    (generated[key] ?? []).map((item) => ({
      workspaceId,
      brainId: brain.id,
      category,
      query: item.query,
      basedOn: item.basedOn || null,
    })),
  );

  if (rows.length === 0) {
    return { attempted: 0, created: 0, queries: await listSearchQueries(workspaceId) };
  }

  const existing = await SearchQueryModel.find({ workspaceId, query: { $in: rows.map((r) => r.query) } }, { query: 1 });
  const seenQueries = new Set(existing.map((r) => r.query as string));

  const toInsert: typeof rows = [];
  for (const row of rows) {
    if (seenQueries.has(row.query)) continue;
    seenQueries.add(row.query);
    toInsert.push(row);
  }

  let created = 0;
  if (toInsert.length > 0) {
    const inserted = await SearchQueryModel.insertMany(toInsert, { ordered: false });
    created = inserted.length;
  }

  return { attempted: rows.length, created, queries: await listSearchQueries(workspaceId) };
}
