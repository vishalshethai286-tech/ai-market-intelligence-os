"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditProductCatalog } from "@/lib/access-control";
import {
  approveProductService,
  createProductService,
  deleteProductService,
  generateProductServices,
  NoAnalysisError,
  ProductServiceNotFoundError,
  rejectProductService,
  updateProductService,
} from "@/lib/product-discovery/service";
import { DiscoveryError } from "@/lib/product-discovery/extract";
import { AIExtractionValidationError } from "@/lib/ai-extraction";
import { ProductServiceSchema, toList, type ProductServiceFormState } from "@/lib/validations/product-service";

// Revalidated everywhere the catalog can be viewed/edited: the dashboard
// page (approved/pending counts), the dashboard review screen, and the
// onboarding review step.
const PRODUCTS_PATHS = ["/dashboard", "/dashboard/products", "/onboarding/review-products"];

function revalidateProductsPaths() {
  for (const path of PRODUCTS_PATHS) revalidatePath(path);
  revalidatePath("/dashboard/products/[id]", "page");
}

export async function regenerateProductDiscoveryAction(): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { error: "You don't have access to run product discovery." };
  }

  try {
    await generateProductServices(active.workspace.id);
  } catch (error) {
    if (error instanceof NoAnalysisError) return { error: error.message };
    if (error instanceof DiscoveryError) return { error: error.message };
    if (error instanceof AIExtractionValidationError) return { error: error.message };
    return { error: "Couldn't run discovery right now. Please try again." };
  }

  revalidateProductsPaths();
}

export async function updateProductServiceAction(
  _prevState: ProductServiceFormState,
  formData: FormData,
): Promise<ProductServiceFormState> {
  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { message: "You don't have access to edit this record." };
  }

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { message: "Missing record id." };
  }

  const validatedFields = ProductServiceSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    category: formData.get("category"),
    subcategory: formData.get("subcategory"),
    description: formData.get("description"),
    applications: toList(formData.get("applications")),
    targetIndustries: toList(formData.get("targetIndustries")),
    buyerTypes: toList(formData.get("buyerTypes")),
    keywords: toList(formData.get("keywords")),
    synonyms: toList(formData.get("synonyms")),
    relatedProductsServices: toList(formData.get("relatedProductsServices")),
    projectKeywords: toList(formData.get("projectKeywords")),
    tenderKeywords: toList(formData.get("tenderKeywords")),
    vendorRegistrationKeywords: toList(formData.get("vendorRegistrationKeywords")),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  try {
    await updateProductService(active.workspace.id, id, validatedFields.data);
  } catch (error) {
    if (error instanceof ProductServiceNotFoundError) return { message: error.message };
    throw error;
  }

  revalidateProductsPaths();
  return { message: "Changes saved." };
}

/** Adds a manually-created catalog entry — a human asserting a product/service exists, not an AI extraction. */
export async function createProductServiceAction(
  _prevState: ProductServiceFormState,
  formData: FormData,
): Promise<ProductServiceFormState> {
  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { message: "You don't have access to add a catalog entry." };
  }

  const validatedFields = ProductServiceSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    category: formData.get("category"),
    subcategory: formData.get("subcategory"),
    description: formData.get("description"),
    applications: toList(formData.get("applications")),
    targetIndustries: toList(formData.get("targetIndustries")),
    buyerTypes: toList(formData.get("buyerTypes")),
    keywords: toList(formData.get("keywords")),
    synonyms: toList(formData.get("synonyms")),
    relatedProductsServices: toList(formData.get("relatedProductsServices")),
    projectKeywords: toList(formData.get("projectKeywords")),
    tenderKeywords: toList(formData.get("tenderKeywords")),
    vendorRegistrationKeywords: toList(formData.get("vendorRegistrationKeywords")),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await createProductService(active.workspace.id, validatedFields.data);
  revalidateProductsPaths();
  return { message: "Added." };
}

export async function approveProductServiceAction(id: string): Promise<{ error?: string } | undefined> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { error: "You don't have access to approve this record." };
  }

  try {
    await approveProductService(active.workspace.id, id, session.user.id);
  } catch (error) {
    if (error instanceof ProductServiceNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateProductsPaths();
}

export async function rejectProductServiceAction(id: string): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { error: "You don't have access to reject this record." };
  }

  try {
    await rejectProductService(active.workspace.id, id);
  } catch (error) {
    if (error instanceof ProductServiceNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateProductsPaths();
}

export async function deleteProductServiceAction(id: string): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canEditProductCatalog(active.role)) {
    return { error: "You don't have access to delete this record." };
  }

  try {
    await deleteProductService(active.workspace.id, id);
  } catch (error) {
    if (error instanceof ProductServiceNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateProductsPaths();
}
