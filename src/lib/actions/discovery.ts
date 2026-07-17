"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { runDiscoveryForWorkspace } from "@/lib/discovery/service";
import {
  approveTargetCompany,
  createTargetCompany,
  rejectTargetCompany,
  deleteTargetCompany,
  TargetCompanyNotFoundError,
} from "@/lib/target-companies/service";
import { BrainNotReadyError } from "@/lib/business-brain/service";
import { TargetCompanySchema, type TargetCompanyFormState } from "@/lib/validations/target-company";
import type { WorkspaceDiscoveryResult } from "@/lib/discovery/service";

const CUSTOMERS_PATHS = ["/dashboard", "/dashboard/customers"];

function revalidateCustomersPaths() {
  for (const path of CUSTOMERS_PATHS) revalidatePath(path);
}

export type RunDiscoveryActionResult =
  | { ok: true; result: WorkspaceDiscoveryResult }
  | { ok: false; error: string };

export async function runDiscoveryAction(): Promise<RunDiscoveryActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to run discovery." };
  }

  try {
    const result = await runDiscoveryForWorkspace(active.workspace.id);
    revalidateCustomersPaths();
    return { ok: true, result };
  } catch (error) {
    if (error instanceof BrainNotReadyError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't run discovery right now. Please try again." };
  }
}

/** Adds a manually-created target company — a human asserting a lead exists, not an AI discovery. */
export async function createTargetCompanyAction(
  _prevState: TargetCompanyFormState,
  formData: FormData,
): Promise<TargetCompanyFormState> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { message: "You don't have access to add a target company." };
  }

  const validatedFields = TargetCompanySchema.safeParse({
    companyName: formData.get("companyName"),
    website: formData.get("website"),
    country: formData.get("country"),
    cityState: formData.get("cityState"),
    industry: formData.get("industry"),
    companyDescription: formData.get("companyDescription"),
    buyerType: formData.get("buyerType"),
    matchedProduct: formData.get("matchedProduct"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await createTargetCompany(active.workspace.id, validatedFields.data);
  revalidateCustomersPaths();
  return { message: "Added." };
}

export async function approveTargetCompanyAction(id: string): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { error: "You don't have access to approve this record." };
  }

  try {
    await approveTargetCompany(active.workspace.id, id);
  } catch (error) {
    if (error instanceof TargetCompanyNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateCustomersPaths();
}

export async function rejectTargetCompanyAction(id: string): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { error: "You don't have access to reject this record." };
  }

  try {
    await rejectTargetCompany(active.workspace.id, id);
  } catch (error) {
    if (error instanceof TargetCompanyNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateCustomersPaths();
}

export async function deleteTargetCompanyAction(id: string): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { error: "You don't have access to delete this record." };
  }

  try {
    await deleteTargetCompany(active.workspace.id, id);
  } catch (error) {
    if (error instanceof TargetCompanyNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateCustomersPaths();
}
