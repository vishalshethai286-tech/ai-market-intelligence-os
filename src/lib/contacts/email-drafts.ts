import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ContactEmailTemplate as ContactEmailTemplateModel, Contact as ContactModel } from "@/models";
import type { ContactEmailTemplate, ContactEmailTemplateType } from "@/models";
import { listBrainFacts } from "@/lib/business-brain/service";
import { getCustomer, CustomerNotFoundError } from "@/lib/customers/service";
import { getProject, ProjectNotFoundError } from "@/lib/projects/service";
import { getTenderBuyer, TenderBuyerNotFoundError } from "@/lib/tenders/buyer-service";
import { getTenderOpportunity, TenderOpportunityNotFoundError } from "@/lib/tenders/opportunity-service";
import { getVendorRegistration, VendorRegistrationNotFoundError } from "@/lib/vendor-registrations/service";

export class ContactEmailTemplateNotFoundError extends Error {}
export class DefaultTemplateProtectedError extends Error {}
export class ContactNotFoundForDraftError extends Error {}

/**
 * Editable draft-generation only — this module never sends an email, never
 * connects to Gmail/SMTP/any outreach API, and never triggers anything
 * automatically. generateContactEmailDraft() returns plain subject/body
 * text for a human to review, edit, and send themselves from their own
 * email client; if they want a record of it, the caller can separately log
 * a ContactActivity with outcome EMAIL_DRAFTED (this module does not do
 * that itself).
 */
export async function listContactEmailTemplates(workspaceId: string): Promise<ContactEmailTemplate[]> {
  await dbConnect();
  const rows = await ContactEmailTemplateModel.find({ workspaceId }).sort({ isDefault: -1, name: 1 });
  return rows.map((r) => r.toObject() as ContactEmailTemplate);
}

export async function getContactEmailTemplate(workspaceId: string, id: string): Promise<ContactEmailTemplate> {
  await dbConnect();
  const doc = await ContactEmailTemplateModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactEmailTemplateNotFoundError("That email template doesn't exist in this workspace.");
  return doc.toObject() as ContactEmailTemplate;
}

export type CreateContactEmailTemplateInput = {
  name: string;
  templateType: ContactEmailTemplateType;
  subject: string;
  body: string;
  productServiceContext?: string;
  createdBy?: string;
};

/** Always creates a non-default (deletable) custom template — only the seeded defaults (see seedDefaultContactEmailTemplates below) are ever marked isDefault. */
export async function createContactEmailTemplate(workspaceId: string, input: CreateContactEmailTemplateInput): Promise<ContactEmailTemplate> {
  await dbConnect();
  const created = await ContactEmailTemplateModel.create({
    workspaceId,
    name: input.name,
    templateType: input.templateType,
    subject: input.subject,
    body: input.body,
    productServiceContext: input.productServiceContext || null,
    isDefault: false,
    createdBy: input.createdBy || null,
  });
  return created.toObject() as ContactEmailTemplate;
}

export type UpdateContactEmailTemplateInput = Partial<{
  name: string;
  templateType: ContactEmailTemplateType;
  subject: string;
  body: string;
  productServiceContext: string;
}>;

export async function updateContactEmailTemplate(workspaceId: string, id: string, input: UpdateContactEmailTemplateInput): Promise<ContactEmailTemplate> {
  await dbConnect();
  const doc = await ContactEmailTemplateModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactEmailTemplateNotFoundError("That email template doesn't exist in this workspace.");

  if (input.name !== undefined) doc.name = input.name;
  if (input.templateType !== undefined) doc.templateType = input.templateType;
  if (input.subject !== undefined) doc.subject = input.subject;
  if (input.body !== undefined) doc.body = input.body;
  if (input.productServiceContext !== undefined) doc.productServiceContext = input.productServiceContext;

  await doc.save();
  return doc.toObject() as ContactEmailTemplate;
}

/** Refuses to delete a seeded default template (DefaultTemplateProtectedError) — a workspace's own custom templates delete freely. */
export async function deleteContactEmailTemplate(workspaceId: string, id: string): Promise<void> {
  await dbConnect();
  const doc = await ContactEmailTemplateModel.findOne({ _id: id, workspaceId });
  if (!doc) throw new ContactEmailTemplateNotFoundError("That email template doesn't exist in this workspace.");
  if (doc.isDefault) throw new DefaultTemplateProtectedError("Default templates can't be deleted.");
  await ContactEmailTemplateModel.deleteOne({ _id: id, workspaceId });
}

type DefaultTemplateSeed = { name: string; templateType: ContactEmailTemplateType; subject: string; body: string };

/** The 7 seeded default templates — a workspace's starting point, editable but not deletable (see deleteContactEmailTemplate). Every placeholder here is one generateContactEmailDraft() knows how to fill. */
const DEFAULT_TEMPLATE_SEEDS: DefaultTemplateSeed[] = [
  {
    name: "General introduction",
    templateType: "INTRODUCTION",
    subject: "Introduction from {{ourCompanyName}}",
    body:
      "Hi {{contactName}},\n\n" +
      "My name is [Your Name] and I'm reaching out from {{ourCompanyName}}. I came across {{companyName}} and wanted to introduce ourselves as a potential supply partner{{sourceContext}}.\n\n" +
      "We specialize in {{productService}} and would welcome the chance to discuss how we might support {{companyName}}'s requirements in {{country}}.\n\n" +
      "Would you be open to a short call this week?\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Vendor registration request",
    templateType: "VENDOR_REGISTRATION",
    subject: "Vendor registration inquiry — {{ourCompanyName}}",
    body:
      "Hi {{contactName}},\n\n" +
      "I'm writing from {{ourCompanyName}} regarding {{companyName}}'s vendor/supplier registration process{{sourceContext}}.\n\n" +
      "We'd like to be considered as an approved supplier for {{productService}}. Could you let us know the registration requirements and required documentation, or point us to the right team?\n\n" +
      "Thank you for your time,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Tender clarification/follow-up",
    templateType: "TENDER_FOLLOW_UP",
    subject: "Clarification request — {{matchedOpportunity}}",
    body:
      "Hi {{contactName}},\n\n" +
      "I'm following up regarding {{matchedOpportunity}}{{sourceContext}}. We're reviewing the tender documentation for {{productService}} and would appreciate clarification on a few points, or confirmation of the submission process.\n\n" +
      "Please let us know a convenient time to speak, or the best way to submit our questions.\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Project supply introduction",
    templateType: "PROJECT_OPPORTUNITY",
    subject: "Supply partner for {{matchedOpportunity}}",
    body:
      "Hi {{contactName}},\n\n" +
      "I understand {{companyName}} is progressing {{matchedOpportunity}}{{sourceContext}}. {{ourCompanyName}} supplies {{productService}} and has supported similar projects in {{country}}.\n\n" +
      "I'd welcome the opportunity to introduce our capabilities and discuss how we could support this project.\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Product/service capability introduction",
    templateType: "PRODUCT_INTRODUCTION",
    subject: "{{productService}} — capability introduction from {{ourCompanyName}}",
    body:
      "Hi {{contactName}},\n\n" +
      "I wanted to introduce {{ourCompanyName}}'s {{productService}} to {{companyName}}{{sourceContext}}. We'd be glad to share our capability statement and discuss your current requirements in {{country}}.\n\n" +
      "Let me know if a short introductory call would be useful.\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Meeting request",
    templateType: "MEETING_REQUEST",
    subject: "Meeting request — {{ourCompanyName}} and {{companyName}}",
    body:
      "Hi {{contactName}},\n\n" +
      "Following up on our earlier contact{{sourceContext}}, I'd like to schedule a short meeting to discuss {{productService}} and how {{ourCompanyName}} can support {{companyName}}.\n\n" +
      "Would you have 20-30 minutes in the coming week?\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
  {
    name: "Follow-up after first contact",
    templateType: "FOLLOW_UP",
    subject: "Following up — {{ourCompanyName}}",
    body:
      "Hi {{contactName}},\n\n" +
      "I wanted to follow up on our earlier conversation{{sourceContext}} regarding {{productService}}. Please let me know if you need any further information from {{ourCompanyName}}, or if there's a better time to reconnect.\n\n" +
      "Looking forward to hearing from you.\n\n" +
      "Best regards,\n[Your Name]\n{{ourCompanyName}}",
  },
];

/** Creates any of the 7 default templates that aren't already seeded for this workspace (matched by templateType among isDefault rows) — safe to call repeatedly, never duplicates. */
export async function seedDefaultContactEmailTemplates(workspaceId: string): Promise<{ created: number }> {
  await dbConnect();
  const existing = await ContactEmailTemplateModel.find({ workspaceId, isDefault: true }, { templateType: 1 });
  const existingTypes = new Set(existing.map((t) => t.templateType as string));

  const toCreate = DEFAULT_TEMPLATE_SEEDS.filter((seed) => !existingTypes.has(seed.templateType));
  if (toCreate.length === 0) return { created: 0 };

  await ContactEmailTemplateModel.insertMany(
    toCreate.map((seed) => ({
      workspaceId,
      name: seed.name,
      templateType: seed.templateType,
      subject: seed.subject,
      body: seed.body,
      isDefault: true,
    })),
  );
  return { created: toCreate.length };
}

async function resolveMatchedOpportunityName(workspaceId: string, contact: { relatedProjectOpportunityId: string | null; relatedTenderOpportunityId: string | null; relatedTenderBuyerId: string | null; relatedVendorRegistrationId: string | null; relatedTargetCustomerId: string | null }): Promise<string> {
  if (contact.relatedProjectOpportunityId) {
    try {
      const project = await getProject(workspaceId, contact.relatedProjectOpportunityId);
      return project.projectName;
    } catch (error) {
      if (!(error instanceof ProjectNotFoundError)) throw error;
    }
  }
  if (contact.relatedTenderOpportunityId) {
    try {
      const tender = await getTenderOpportunity(workspaceId, contact.relatedTenderOpportunityId);
      return tender.tenderTitle;
    } catch (error) {
      if (!(error instanceof TenderOpportunityNotFoundError)) throw error;
    }
  }
  if (contact.relatedTenderBuyerId) {
    try {
      const buyer = await getTenderBuyer(workspaceId, contact.relatedTenderBuyerId);
      return buyer.customerName;
    } catch (error) {
      if (!(error instanceof TenderBuyerNotFoundError)) throw error;
    }
  }
  if (contact.relatedVendorRegistrationId) {
    try {
      const registration = await getVendorRegistration(workspaceId, contact.relatedVendorRegistrationId);
      return `${registration.customerName} vendor registration`;
    } catch (error) {
      if (!(error instanceof VendorRegistrationNotFoundError)) throw error;
    }
  }
  if (contact.relatedTargetCustomerId) {
    try {
      const customer = await getCustomer(workspaceId, contact.relatedTargetCustomerId);
      return `${customer.customerName} opportunity`;
    } catch (error) {
      if (!(error instanceof CustomerNotFoundError)) throw error;
    }
  }
  return "your requirements";
}

export type GenerateContactEmailDraftInput = {
  contactId: string;
  templateId: string;
  productService?: string;
};

export type ContactEmailDraft = {
  templateId: string;
  templateType: ContactEmailTemplateType;
  subject: string;
  body: string;
};

function fillPlaceholders(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), text);
}

/**
 * Fills a template's {{placeholder}} tokens from the Contact, whichever
 * related entity it's linked to, and the Business Brain's company name —
 * and nothing else. Returns editable text; does not send, save, or log
 * anything itself (the caller decides whether to log a ContactActivity
 * with outcome EMAIL_DRAFTED once the user actually uses the draft).
 */
export async function generateContactEmailDraft(workspaceId: string, input: GenerateContactEmailDraftInput): Promise<ContactEmailDraft> {
  await dbConnect();

  const [contact, template, facts] = await Promise.all([
    ContactModel.findOne({ _id: input.contactId, workspaceId }),
    ContactEmailTemplateModel.findOne({ _id: input.templateId, workspaceId }),
    listBrainFacts(workspaceId),
  ]);
  if (!contact) throw new ContactNotFoundForDraftError("That contact doesn't exist in this workspace.");
  if (!template) throw new ContactEmailTemplateNotFoundError("That email template doesn't exist in this workspace.");

  const matchedOpportunity = await resolveMatchedOpportunityName(workspaceId, {
    relatedProjectOpportunityId: contact.relatedProjectOpportunityId,
    relatedTenderOpportunityId: contact.relatedTenderOpportunityId,
    relatedTenderBuyerId: contact.relatedTenderBuyerId,
    relatedVendorRegistrationId: contact.relatedVendorRegistrationId,
    relatedTargetCustomerId: contact.relatedTargetCustomerId,
  });

  const ourCompanyName = facts.find((f) => f.factType === "COMPANY_NAME")?.factValue || "our company";
  const sourceContext = contact.sourceUrl ? ` (found via ${contact.sourceUrl})` : "";

  const values: Record<string, string> = {
    contactName: (contact.fullName as string) || "there",
    companyName: (contact.companyName as string) || "your organization",
    designation: (contact.designation as string) || "",
    ourCompanyName,
    productService: input.productService || (template.productServiceContext as string) || "our products and services",
    matchedOpportunity,
    country: (contact.country as string) || "your region",
    sourceContext,
  };

  return {
    templateId: template.id as string,
    templateType: template.templateType as ContactEmailTemplateType,
    subject: fillPlaceholders(template.subject as string, values),
    body: fillPlaceholders(template.body as string, values),
  };
}
