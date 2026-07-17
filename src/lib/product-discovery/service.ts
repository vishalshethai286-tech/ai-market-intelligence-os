import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ProductService as ProductServiceModel, WebsiteAnalysis } from "@/models";
import { listPageSnapshots } from "@/lib/website-analyzer";
import { extractProductServicesAI } from "@/lib/ai-extraction";
import { isJsonId, newJsonId, readCollection, writeCollection } from "@/lib/json-store";
import type { ExtractedProductService } from "./schema";
import type { PageContent } from "./types";
import type { ProductService } from "@/models";

export class NoAnalysisError extends Error {}
export class ProductServiceNotFoundError extends Error {}

const JSON_COLLECTION = "product-services";

/**
 * Manually-added catalog entries (see AddProductServiceDialog) are stored as
 * plain JSON under data/product-services.json instead of MongoDB, at the
 * user's request for something they can inspect/edit without database
 * knowledge — AI-discovered entries (generateProductServices) are unaffected
 * and stay in MongoDB, since lead-scoring/business-brain read those directly.
 * Reads merge both stores; writes route to whichever store owns the id
 * (isJsonId), so the rest of the app (pages, actions) doesn't need to know
 * the difference.
 */
type JsonProductService = {
  id: string;
  workspaceId: string;
  websiteAnalysisId: string | null;
  name: string;
  type: "PRODUCT" | "SERVICE";
  category: string | null;
  subcategory: string | null;
  description: string | null;
  applications: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  keywords: string[];
  synonyms: string[];
  relatedProductsServices: string[];
  projectKeywords: string[];
  tenderKeywords: string[];
  vendorRegistrationKeywords: string[];
  sourceUrls: string[];
  confidenceScore: number;
  lastVerifiedAt: string | null;
  aiRawExtraction: unknown;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toProductService(row: JsonProductService): ProductService {
  return {
    ...row,
    lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null,
    approvedAt: row.approvedAt ? new Date(row.approvedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  } as ProductService;
}

async function readJsonProductServices(workspaceId: string): Promise<ProductService[]> {
  const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
  return rows.filter((row) => row.workspaceId === workspaceId).map(toProductService);
}

export async function listProductServices(workspaceId: string): Promise<ProductService[]> {
  await dbConnect();
  const [dbRows, jsonRows] = await Promise.all([
    ProductServiceModel.find({ workspaceId }).then((rows) => rows.map((r) => r.toObject() as ProductService)),
    readJsonProductServices(workspaceId),
  ]);

  const statusOrder = { PENDING_REVIEW: 0, APPROVED: 1, REJECTED: 1 } as const;
  return [...dbRows, ...jsonRows].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    if (statusDiff !== 0) return statusDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Single-record read for the detail page — null (not a throw) when missing, since a page just wants to 404. */
export async function getProductService(workspaceId: string, id: string): Promise<ProductService | null> {
  if (isJsonId(id)) {
    const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
    const row = rows.find((r) => r.id === id && r.workspaceId === workspaceId);
    return row ? toProductService(row) : null;
  }

  await dbConnect();
  const doc = await ProductServiceModel.findOne({ _id: id, workspaceId });
  return doc ? (doc.toObject() as ProductService) : null;
}

/** Ownership-checked read — never trust an id alone across workspace boundaries. */
async function requireOwnedProductService(workspaceId: string, id: string) {
  if (isJsonId(id)) {
    const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
    const existing = rows.find((row) => row.id === id && row.workspaceId === workspaceId);
    if (!existing) {
      throw new ProductServiceNotFoundError("That product/service record doesn't exist in this workspace.");
    }
    return existing;
  }

  await dbConnect();
  const existing = await ProductServiceModel.findOne({ _id: id, workspaceId });
  if (!existing) {
    throw new ProductServiceNotFoundError("That product/service record doesn't exist in this workspace.");
  }
  return existing;
}

/**
 * Runs discovery against the workspace's latest completed WebsiteAnalysis:
 * reads the page snapshots stored for that run (homepage plus a bounded set
 * of identified product/service/catalog pages — fetched once by the website
 * analyzer itself, see src/lib/website-analyzer/page-snapshots.ts, not
 * re-fetched here), asks the AI extraction service to enumerate distinct
 * products/services, then replaces every non-APPROVED row for the workspace
 * with the fresh results. APPROVED rows are never touched by a regenerate —
 * they're a finalized human decision.
 */
export async function generateProductServices(workspaceId: string) {
  await dbConnect();
  const analysis = await WebsiteAnalysis.findOne({ workspaceId, status: "COMPLETED" }).sort({ createdAt: -1 });
  if (!analysis) {
    throw new NoAnalysisError("Run a website analysis before discovering products or services.");
  }

  const snapshots = await listPageSnapshots(analysis.id);
  const pages: PageContent[] =
    snapshots.length > 0
      ? snapshots.map((page) => ({ url: page.url, title: page.title, text: page.visibleText ?? "" }))
      : [{ url: analysis.url, title: analysis.title, text: analysis.visibleText ?? "" }];

  const extracted = await extractProductServicesAI(pages);

  // Not wrapped in a DB transaction — standalone MongoDB (no replica set)
  // doesn't support multi-document transactions; acceptable for an MVP.
  await ProductServiceModel.deleteMany({ workspaceId, status: { $ne: "APPROVED" } });

  if (extracted.length === 0) return [];

  await ProductServiceModel.insertMany(extracted.map((item) => toCreateData(workspaceId, analysis.id, item)));

  const created = await ProductServiceModel.find({
    workspaceId,
    websiteAnalysisId: analysis.id,
    status: "PENDING_REVIEW",
  }).sort({ createdAt: -1 });
  return created.map((r) => r.toObject() as ProductService);
}

function toCreateData(workspaceId: string, websiteAnalysisId: string, item: ExtractedProductService) {
  return {
    workspaceId,
    websiteAnalysisId,
    name: item.name,
    type: item.type,
    category: item.category || null,
    subcategory: item.subcategory || null,
    description: item.description || null,
    applications: item.applications,
    targetIndustries: item.targetIndustries,
    buyerTypes: item.buyerTypes,
    keywords: item.keywords,
    synonyms: item.synonyms,
    relatedProductsServices: item.relatedProductsServices,
    projectKeywords: item.projectKeywords,
    tenderKeywords: item.tenderKeywords,
    vendorRegistrationKeywords: item.vendorRegistrationKeywords,
    sourceUrls: item.sourceUrls,
    confidenceScore: item.confidenceScore,
    aiRawExtraction: item,
    status: "PENDING_REVIEW" as const,
  };
}

export type ProductServiceEditableFields = {
  name: string;
  type: "PRODUCT" | "SERVICE";
  category: string;
  subcategory: string;
  description: string;
  applications: string[];
  targetIndustries: string[];
  buyerTypes: string[];
  keywords: string[];
  synonyms: string[];
  relatedProductsServices: string[];
  projectKeywords: string[];
  tenderKeywords: string[];
  vendorRegistrationKeywords: string[];
};

/** Reads the full JSON collection, patches the row matching id/workspaceId, writes it back, and returns it. */
async function patchJsonProductService(
  workspaceId: string,
  id: string,
  patch: Partial<JsonProductService>,
): Promise<ProductService> {
  const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
  const index = rows.findIndex((row) => row.id === id && row.workspaceId === workspaceId);
  if (index === -1) {
    throw new ProductServiceNotFoundError("That product/service record doesn't exist in this workspace.");
  }
  rows[index] = { ...rows[index], ...patch, updatedAt: new Date().toISOString() };
  await writeCollection(JSON_COLLECTION, rows);
  return toProductService(rows[index]);
}

export async function updateProductService(workspaceId: string, id: string, fields: ProductServiceEditableFields) {
  await requireOwnedProductService(workspaceId, id);

  const data = {
    name: fields.name,
    type: fields.type,
    category: fields.category || null,
    subcategory: fields.subcategory || null,
    description: fields.description || null,
    applications: fields.applications,
    targetIndustries: fields.targetIndustries,
    buyerTypes: fields.buyerTypes,
    keywords: fields.keywords,
    synonyms: fields.synonyms,
    relatedProductsServices: fields.relatedProductsServices,
    projectKeywords: fields.projectKeywords,
    tenderKeywords: fields.tenderKeywords,
    vendorRegistrationKeywords: fields.vendorRegistrationKeywords,
  };

  if (isJsonId(id)) {
    return patchJsonProductService(workspaceId, id, { ...data, lastVerifiedAt: new Date().toISOString() });
  }

  await ProductServiceModel.updateOne({ _id: id }, { ...data, lastVerifiedAt: new Date() });
  return ProductServiceModel.findById(id);
}

/**
 * Adds a manually-created catalog entry — a human asserting a product/service
 * exists, not an AI extraction. Maximally confident (1), no source URLs or
 * AI raw output, and starts PENDING_REVIEW like everything else so it still
 * goes through the same approve/reject review step. Stored as JSON, not
 * MongoDB — see the JsonProductService comment above.
 */
export async function createProductService(
  workspaceId: string,
  fields: ProductServiceEditableFields,
): Promise<ProductService> {
  const now = new Date().toISOString();
  const row: JsonProductService = {
    id: newJsonId(),
    workspaceId,
    websiteAnalysisId: null,
    name: fields.name,
    type: fields.type,
    category: fields.category || null,
    subcategory: fields.subcategory || null,
    description: fields.description || null,
    applications: fields.applications,
    targetIndustries: fields.targetIndustries,
    buyerTypes: fields.buyerTypes,
    keywords: fields.keywords,
    synonyms: fields.synonyms,
    relatedProductsServices: fields.relatedProductsServices,
    projectKeywords: fields.projectKeywords,
    tenderKeywords: fields.tenderKeywords,
    vendorRegistrationKeywords: fields.vendorRegistrationKeywords,
    sourceUrls: [],
    confidenceScore: 1,
    lastVerifiedAt: null,
    aiRawExtraction: null,
    status: "PENDING_REVIEW",
    approvedAt: null,
    approvedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };

  const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
  rows.push(row);
  await writeCollection(JSON_COLLECTION, rows);
  return toProductService(row);
}

export async function approveProductService(workspaceId: string, id: string, userId: string) {
  await requireOwnedProductService(workspaceId, id);

  if (isJsonId(id)) {
    return patchJsonProductService(workspaceId, id, {
      status: "APPROVED",
      approvedAt: new Date().toISOString(),
      approvedByUserId: userId,
    });
  }

  await ProductServiceModel.updateOne(
    { _id: id },
    { status: "APPROVED", approvedAt: new Date(), approvedByUserId: userId },
  );
  return ProductServiceModel.findById(id);
}

export async function rejectProductService(workspaceId: string, id: string) {
  await requireOwnedProductService(workspaceId, id);

  if (isJsonId(id)) {
    return patchJsonProductService(workspaceId, id, {
      status: "REJECTED",
      approvedAt: null,
      approvedByUserId: null,
    });
  }

  await ProductServiceModel.updateOne({ _id: id }, { status: "REJECTED", approvedAt: null, approvedByUserId: null });
  return ProductServiceModel.findById(id);
}

export async function deleteProductService(workspaceId: string, id: string) {
  await requireOwnedProductService(workspaceId, id);

  if (isJsonId(id)) {
    const rows = await readCollection<JsonProductService>(JSON_COLLECTION);
    const filtered = rows.filter((row) => !(row.id === id && row.workspaceId === workspaceId));
    await writeCollection(JSON_COLLECTION, filtered);
    return;
  }

  await ProductServiceModel.deleteOne({ _id: id });
}
