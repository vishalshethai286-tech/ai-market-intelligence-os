"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import {
  createContact,
  updateContact,
  changeContactStatus,
  addContactActivity,
  deleteOrArchiveContact,
  linkContactToTargetCustomer,
  linkContactToProject,
  linkContactToTenderBuyer,
  linkContactToTenderOpportunity,
  linkContactToVendorRegistration,
  ContactNotFoundError,
  RelatedRecordNotFoundError,
} from "@/lib/contacts/service";
import type { AddContactActivityInput, RelatedRecordType } from "@/lib/contacts/service";
import { refreshContactEnrichment, refreshWorkspaceContactEnrichment } from "@/lib/contacts/enrichment";
import { UsageLimitExceededError } from "@/lib/billing/usage";
import { ContactFormSchema, toList } from "@/lib/validations/contact";
import type { ContactFormState } from "@/lib/validations/contact";
import type { ContactStatus } from "@/models";

function revalidateContactPaths() {
  revalidatePath("/dashboard/contacts");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/tender-buyers");
  revalidatePath("/dashboard/live-tenders");
  revalidatePath("/dashboard/vendor-registrations");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard");
}

export type ContactActionResult = { ok: true } | { ok: false; error: string };

function parseContactFormData(formData: FormData) {
  const validated = ContactFormSchema.safeParse({
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName") ?? "",
    companyWebsite: formData.get("companyWebsite") ?? "",
    designation: formData.get("designation") ?? "",
    department: formData.get("department") ?? "",
    roleCategory: formData.get("roleCategory") ?? "",
    seniority: formData.get("seniority") ?? "",
    email: formData.get("email") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    mobileNumber: formData.get("mobileNumber") ?? "",
    linkedinUrl: formData.get("linkedinUrl") ?? "",
    country: formData.get("country") ?? "",
    location: formData.get("location") ?? "",
    status: formData.get("status") ?? "NEW",
    notes: formData.get("notes") ?? "",
    tags: toList(formData.get("tags")),
    sourceUrl: formData.get("sourceUrl") ?? "",
    sourceType: formData.get("sourceType") ?? "MANUAL_ENTRY",
  });
  if (!validated.success) return validated;

  // "" means "let the system infer this from the designation" — translate to undefined for the service layer's optional-override fields.
  return {
    ...validated,
    data: {
      ...validated.data,
      roleCategory: validated.data.roleCategory || undefined,
      seniority: validated.data.seniority || undefined,
    },
  };
}

/** Creates a new contact (or, per createContact's own dedup check, updates a plausibly-existing one instead) from a submitted contact-form.tsx form. */
export async function createContactAction(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { message: "You don't have access to create contacts." };
  }

  const validatedFields = parseContactFormData(formData);
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  try {
    const { contact, outcome } = await createContact(active.workspace.id, validatedFields.data);
    revalidateContactPaths();
    return {
      message: outcome === "UPDATED_EXISTING" ? "A matching contact already existed — updated it instead of creating a duplicate." : "Contact created.",
      contactId: contact.id,
    };
  } catch (error) {
    if (error instanceof UsageLimitExceededError) return { message: error.message };
    throw error;
  }
}

/** Updates an existing contact's editable fields from a submitted contact-form.tsx form — the contact id travels as a hidden field. */
export async function updateContactAction(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { message: "You don't have access to update contacts." };
  }

  const id = formData.get("contactId");
  if (typeof id !== "string" || !id) {
    return { message: "Missing contact id." };
  }

  const validatedFields = parseContactFormData(formData);
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  try {
    await updateContact(active.workspace.id, id, validatedFields.data);
    revalidateContactPaths();
    return { message: "Contact updated.", contactId: id };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { message: error.message };
    return { message: "Couldn't update that contact right now. Please try again." };
  }
}

export async function changeContactStatusAction(id: string, status: ContactStatus): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contacts." };
  }

  try {
    await changeContactStatus(active.workspace.id, id, status);
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact right now. Please try again." };
  }
}

export async function addContactActivityAction(contactId: string, input: AddContactActivityInput): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to log contact activity." };
  }

  try {
    await addContactActivity(active.workspace.id, contactId, input);
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't log that activity right now. Please try again." };
  }
}

const LINK_FUNCTIONS: Record<RelatedRecordType, typeof linkContactToTargetCustomer> = {
  TARGET_CUSTOMER: linkContactToTargetCustomer,
  PROJECT_OPPORTUNITY: linkContactToProject,
  TENDER_BUYER: linkContactToTenderBuyer,
  TENDER_OPPORTUNITY: linkContactToTenderOpportunity,
  VENDOR_REGISTRATION: linkContactToVendorRegistration,
};

export async function linkContactAction(contactId: string, recordType: RelatedRecordType, recordId: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to link contacts." };
  }

  try {
    await LINK_FUNCTIONS[recordType](active.workspace.id, contactId, recordId);
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError || error instanceof RelatedRecordNotFoundError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Couldn't link that contact right now. Please try again." };
  }
}

export async function deleteOrArchiveContactAction(id: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to archive contacts." };
  }

  try {
    await deleteOrArchiveContact(active.workspace.id, id);
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't archive that contact right now. Please try again." };
  }
}

/** "Refresh Enrichment" — re-runs enrichment scoring/status/missing-fields/recommended-action for one contact, without touching doNotContact or owner/assignedTo. */
export async function refreshContactEnrichmentAction(id: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to refresh contact enrichment." };
  }

  try {
    await refreshContactEnrichment(active.workspace.id, id);
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't refresh enrichment for that contact right now. Please try again." };
  }
}

export type RefreshWorkspaceEnrichmentActionResult = { ok: true; refreshed: number } | { ok: false; error: string };

/** "Refresh All Enrichment" — re-runs enrichment for every contact in the workspace, e.g. after a bulk import or a scoring-rule change. */
export async function refreshWorkspaceContactEnrichmentAction(): Promise<RefreshWorkspaceEnrichmentActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to refresh contact enrichment." };
  }

  try {
    const result = await refreshWorkspaceContactEnrichment(active.workspace.id);
    revalidateContactPaths();
    return { ok: true, refreshed: result.refreshed };
  } catch {
    return { ok: false, error: "Couldn't refresh enrichment right now. Please try again." };
  }
}

/** "Mark Do Not Contact" — sets doNotContact + an optional reason, and immediately re-runs enrichment (which respects doNotContact and reports it in enrichmentStatus/recommendedAction). */
export async function markContactDoNotContactAction(id: string, reason?: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contacts." };
  }

  try {
    await updateContact(active.workspace.id, id, { doNotContact: true, doNotContactReason: reason || undefined });
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact right now. Please try again." };
  }
}

/** "Remove Do Not Contact" — clears the flag and reason, and re-runs enrichment. */
export async function removeContactDoNotContactAction(id: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contacts." };
  }

  try {
    await updateContact(active.workspace.id, id, { doNotContact: false, doNotContactReason: null });
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact right now. Please try again." };
  }
}

/** "Assign Owner" — sets ownerUserId (the person accountable for this contact) or assignedToUserId (the person currently working it), independently. */
export async function assignContactOwnerAction(id: string, ownerUserId: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contacts." };
  }

  try {
    await updateContact(active.workspace.id, id, { ownerUserId: ownerUserId || null });
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact right now. Please try again." };
  }
}

export async function assignContactToUserAction(id: string, assignedToUserId: string): Promise<ContactActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contacts." };
  }

  try {
    await updateContact(active.workspace.id, id, { assignedToUserId: assignedToUserId || null });
    revalidateContactPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that contact right now. Please try again." };
  }
}
