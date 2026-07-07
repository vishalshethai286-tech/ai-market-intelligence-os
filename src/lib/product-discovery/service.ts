import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchAdditionalPages } from "./fetch-pages";
import { extractProductServices } from "./extract";
import type { ExtractedProductService } from "./schema";
import type { Prisma } from "@/generated/prisma/client";

export class NoAnalysisError extends Error {}
export class ProductServiceNotFoundError extends Error {}

type IdentifiedPages = Parameters<typeof fetchAdditionalPages>[1];

export function listProductServices(workspaceId: string) {
  return prisma.productService.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

/** Ownership-checked read — never trust an id alone across workspace boundaries. */
async function requireOwnedProductService(workspaceId: string, id: string) {
  const existing = await prisma.productService.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw new ProductServiceNotFoundError("That product/service record doesn't exist in this workspace.");
  }
  return existing;
}

/**
 * Runs discovery against the workspace's latest completed WebsiteAnalysis:
 * fetches a bounded set of identified product/service/catalog pages (plus
 * the already-stored homepage content), asks Claude to enumerate distinct
 * products/services, then replaces every non-APPROVED row for the workspace
 * with the fresh results. APPROVED rows are never touched by a regenerate —
 * they're a finalized human decision.
 */
export async function generateProductServices(workspaceId: string) {
  const analysis = await prisma.websiteAnalysis.findFirst({
    where: { workspaceId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  if (!analysis) {
    throw new NoAnalysisError("Run a website analysis before discovering products or services.");
  }

  const identifiedPages = (analysis.identifiedPages as IdentifiedPages | null) ?? {};
  const additionalPages = await fetchAdditionalPages(analysis.url, identifiedPages);

  const homepagePage = {
    url: analysis.url,
    title: analysis.title,
    text: analysis.visibleText ?? "",
  };
  const pages = [homepagePage, ...additionalPages];

  const extracted = await extractProductServices(pages);

  return prisma.$transaction(async (tx) => {
    await tx.productService.deleteMany({
      where: { workspaceId, status: { not: "APPROVED" } },
    });

    if (extracted.length === 0) return [];

    await tx.productService.createMany({
      data: extracted.map((item) => toCreateData(workspaceId, analysis.id, item)),
    });

    return tx.productService.findMany({
      where: { workspaceId, websiteAnalysisId: analysis.id, status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
    });
  });
}

function toCreateData(
  workspaceId: string,
  websiteAnalysisId: string,
  item: ExtractedProductService,
): Prisma.ProductServiceCreateManyInput {
  return {
    workspaceId,
    websiteAnalysisId,
    name: item.name,
    category: item.category || null,
    subcategory: item.subcategory || null,
    description: item.description || null,
    applications: item.applications,
    targetIndustries: item.targetIndustries,
    buyerTypes: item.buyerTypes,
    keywords: item.keywords,
    sourceUrls: item.sourceUrls,
    confidenceScore: item.confidenceScore,
    aiRawExtraction: item as unknown as Prisma.InputJsonValue,
    status: "PENDING_REVIEW",
  };
}

export type ProductServiceEditableFields = {
  name: string;
  category: string;
  subcategory: string;
  description: string;
  applications: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  keywords: string[];
};

export async function updateProductService(workspaceId: string, id: string, fields: ProductServiceEditableFields) {
  await requireOwnedProductService(workspaceId, id);
  return prisma.productService.update({
    where: { id },
    data: {
      name: fields.name,
      category: fields.category || null,
      subcategory: fields.subcategory || null,
      description: fields.description || null,
      applications: fields.applications,
      targetIndustries: fields.targetIndustries,
      buyerTypes: fields.buyerTypes,
      keywords: fields.keywords,
    },
  });
}

export async function approveProductService(workspaceId: string, id: string, userId: string) {
  await requireOwnedProductService(workspaceId, id);
  return prisma.productService.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: userId },
  });
}

export async function rejectProductService(workspaceId: string, id: string) {
  await requireOwnedProductService(workspaceId, id);
  return prisma.productService.update({
    where: { id },
    data: { status: "REJECTED", approvedAt: null, approvedByUserId: null },
  });
}

export async function deleteProductService(workspaceId: string, id: string) {
  await requireOwnedProductService(workspaceId, id);
  return prisma.productService.delete({ where: { id } });
}
