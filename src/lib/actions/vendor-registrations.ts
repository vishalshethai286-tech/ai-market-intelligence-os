"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { processVendorRegistrationResults, type ProcessVendorRegistrationResultsOptions } from "@/lib/vendor-registrations/processor";
import { updateVendorRegistrationStatus, VendorRegistrationNotFoundError } from "@/lib/vendor-registrations/service";
import type { VendorRegistrationStatus } from "@/models";

function revalidateVendorRegistrationPaths() {
  revalidatePath("/dashboard/vendor-registrations");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/duplicates");
  revalidatePath("/dashboard/discovery-runs");
  revalidatePath("/dashboard/raw-search-results");
  revalidatePath("/dashboard");
}

export type ProcessVendorRegistrationResultsActionResult =
  | {
      ok: true;
      rawResultsProcessed: number;
      vendorRegistrationsCreated: number;
      vendorRegistrationsUpdated: number;
      linkedCustomers: number;
      customersCreated: number;
      skipped: number;
      failed: number;
      duplicatesFound: number;
      autoMerged: number;
      pendingReview: number;
    }
  | { ok: false; error: string };

/** "Process Vendor Registration Results" — turns queued RawSearchResult (searchType=VENDOR_REGISTRATION) rows into VendorRegistration records, linking or creating TargetCustomer rows where safe. */
export async function processVendorRegistrationResultsAction(
  input: ProcessVendorRegistrationResultsOptions = {},
): Promise<ProcessVendorRegistrationResultsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to process vendor registration results." };
  }

  try {
    const summary = await processVendorRegistrationResults(active.workspace.id, input);
    revalidateVendorRegistrationPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't process vendor registration results right now. Please try again." };
  }
}

export type VendorRegistrationActionResult = { ok: true } | { ok: false; error: string };

export async function updateVendorRegistrationStatusAction(id: string, status: VendorRegistrationStatus): Promise<VendorRegistrationActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update vendor registrations." };
  }

  try {
    await updateVendorRegistrationStatus(active.workspace.id, id, status);
    revalidateVendorRegistrationPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof VendorRegistrationNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that vendor registration right now. Please try again." };
  }
}
