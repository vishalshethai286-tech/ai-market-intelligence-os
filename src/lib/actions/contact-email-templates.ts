"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import {
  createContactEmailTemplate,
  updateContactEmailTemplate,
  deleteContactEmailTemplate,
  generateContactEmailDraft,
  seedDefaultContactEmailTemplates,
  ContactEmailTemplateNotFoundError,
  DefaultTemplateProtectedError,
  ContactNotFoundForDraftError,
} from "@/lib/contacts/email-drafts";
import { addContactActivity } from "@/lib/contacts/service";
import { ContactNotFoundError } from "@/lib/contacts/service";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { incrementUsage } from "@/lib/billing/usage";
import type { CreateContactEmailTemplateInput, UpdateContactEmailTemplateInput, GenerateContactEmailDraftInput } from "@/lib/contacts/email-drafts";

function revalidateContactEmailTemplatePaths() {
  revalidatePath("/dashboard/contact-email-templates");
  revalidatePath("/dashboard/contacts");
}

export type ContactEmailTemplateActionResult = { ok: true; templateId?: string } | { ok: false; error: string };

export async function createContactEmailTemplateAction(input: CreateContactEmailTemplateInput): Promise<ContactEmailTemplateActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to create email templates." };
  }

  try {
    const session = await auth();
    const template = await createContactEmailTemplate(active.workspace.id, { ...input, createdBy: session?.user?.id });
    revalidateContactEmailTemplatePaths();
    return { ok: true, templateId: template.id };
  } catch {
    return { ok: false, error: "Couldn't create that email template right now. Please try again." };
  }
}

export async function updateContactEmailTemplateAction(id: string, input: UpdateContactEmailTemplateInput): Promise<ContactEmailTemplateActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update email templates." };
  }

  try {
    await updateContactEmailTemplate(active.workspace.id, id, input);
    revalidateContactEmailTemplatePaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactEmailTemplateNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that email template right now. Please try again." };
  }
}

export async function deleteContactEmailTemplateAction(id: string): Promise<ContactEmailTemplateActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to delete email templates." };
  }

  try {
    await deleteContactEmailTemplate(active.workspace.id, id);
    revalidateContactEmailTemplatePaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactEmailTemplateNotFoundError || error instanceof DefaultTemplateProtectedError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Couldn't delete that email template right now. Please try again." };
  }
}

/** Seeds the 7 default templates for this workspace if they don't already exist — safe to call on every Email Templates page load. */
export async function seedDefaultContactEmailTemplatesAction(): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const active = await requireActiveWorkspace();

  try {
    const result = await seedDefaultContactEmailTemplates(active.workspace.id);
    if (result.created > 0) revalidateContactEmailTemplatePaths();
    return { ok: true, created: result.created };
  } catch {
    return { ok: false, error: "Couldn't seed default email templates right now." };
  }
}

export type GenerateContactEmailDraftActionResult = { ok: true; subject: string; body: string; templateId: string } | { ok: false; error: string };

/** Generates editable draft text only — never sends anything. See src/lib/contacts/email-drafts.ts's module docblock. */
export async function generateContactEmailDraftAction(input: GenerateContactEmailDraftInput): Promise<GenerateContactEmailDraftActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to generate email drafts." };
  }

  try {
    enforceRateLimit(active.workspace.id, "generate_email_draft");
    const draft = await generateContactEmailDraft(active.workspace.id, input);
    await incrementUsage(active.workspace.id, "email_draft_generated");
    return { ok: true, subject: draft.subject, body: draft.body, templateId: draft.templateId };
  } catch (error) {
    if (error instanceof ContactEmailTemplateNotFoundError || error instanceof ContactNotFoundForDraftError || error instanceof RateLimitExceededError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Couldn't generate an email draft right now. Please try again." };
  }
}

export type LogContactEmailDraftActionResult = { ok: true } | { ok: false; error: string };

/** Only called when the user explicitly chooses to save/log a generated draft — logs a ContactActivity (EMAIL, outcome EMAIL_DRAFTED) with the subject/body as its description. Never sends the email itself. */
export async function logContactEmailDraftAction(contactId: string, subject: string, body: string): Promise<LogContactEmailDraftActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to log contact activity." };
  }

  try {
    await addContactActivity(active.workspace.id, contactId, {
      activityType: "EMAIL",
      title: `Email drafted: ${subject}`,
      description: body,
      outcome: "EMAIL_DRAFTED",
    });
    revalidateContactEmailTemplatePaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't log that draft right now. Please try again." };
  }
}
