import "server-only";
import { prisma } from "@/lib/prisma";
import { getBusinessBrain, listBrainFacts, BrainNotReadyError } from "@/lib/business-brain/service";
import { generateSearchQueries } from "./generate";
import { QUERY_CATEGORIES } from "./constants";
import type { QueryGeneratorContext } from "./prompt";
import type { BrainFact, BrainFactType } from "@/generated/prisma/client";

export { BrainNotReadyError };
export class InsufficientBrainContextError extends Error {}

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

export function listSearchQueries(workspaceId: string) {
  return prisma.searchQuery.findMany({
    where: { workspaceId },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * Generates candidate search queries across all 7 categories in
 * QUERY_CATEGORIES, grounded in the workspace's current Business Brain
 * facts, and stores them as SearchQuery rows. Deduped against past runs via
 * the `workspaceId`+`query` unique constraint — `createMany`'s
 * `skipDuplicates` silently skips any exact-string repeat rather than
 * erroring, so regenerating is safe to call repeatedly.
 */
export async function generateAndStoreSearchQueries(workspaceId: string) {
  const brain = await getBusinessBrain(workspaceId);
  if (!brain || brain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before generating search queries.");
  }

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

  const generated = await generateSearchQueries(context);

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

  const result = await prisma.searchQuery.createMany({ data: rows, skipDuplicates: true });

  return { attempted: rows.length, created: result.count, queries: await listSearchQueries(workspaceId) };
}
