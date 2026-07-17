import { Schema, models, model } from "mongoose";
import { idField, timestamps } from "./shared";

export const CONTACT_EMAIL_TEMPLATE_TYPES = [
  "INTRODUCTION",
  "VENDOR_REGISTRATION",
  "TENDER_FOLLOW_UP",
  "PROJECT_OPPORTUNITY",
  "PRODUCT_INTRODUCTION",
  "CAPABILITY_STATEMENT",
  "MEETING_REQUEST",
  "FOLLOW_UP",
  "CUSTOM",
] as const;
export type ContactEmailTemplateType = (typeof CONTACT_EMAIL_TEMPLATE_TYPES)[number];

/**
 * An editable email draft template — subject/body with `{{placeholder}}`
 * tokens filled in by src/lib/contacts/email-drafts.ts's
 * generateContactEmailDraft(). Storing a template never sends anything;
 * this model (and everything downstream of it) only ever produces text a
 * human reviews and sends themselves, per this phase's explicit "no
 * outreach automation" scope.
 */
const ContactEmailTemplateSchema = new Schema(
  {
    ...idField,
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    templateType: { type: String, enum: CONTACT_EMAIL_TEMPLATE_TYPES, required: true, index: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    /** Free-text hint for which product/service this template is meant to introduce — filled into {{productService}} when set, otherwise the caller supplies one at draft-generation time. */
    productServiceContext: { type: String },
    /** Seeded default templates (see src/lib/contacts/email-drafts.ts's DEFAULT_TEMPLATES) — protected from accidental deletion in the UI, distinct from a workspace's own custom templates. */
    isDefault: { type: Boolean, default: false, index: true },
    createdBy: { type: String },
  },
  timestamps,
);
ContactEmailTemplateSchema.index({ workspaceId: 1, createdAt: -1 });

export const ContactEmailTemplate = models.ContactEmailTemplate ?? model("ContactEmailTemplate", ContactEmailTemplateSchema);

export type ContactEmailTemplate = {
  id: string;
  workspaceId: string;
  name: string;
  templateType: ContactEmailTemplateType;
  subject: string;
  body: string;
  productServiceContext: string | null;
  isDefault: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};
