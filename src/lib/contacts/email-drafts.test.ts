import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  Contact,
  ContactEmailTemplate,
  CompanyProfile,
  ProjectOpportunity,
  TenderOpportunity,
  VendorRegistration,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const {
  listContactEmailTemplates,
  createContactEmailTemplate,
  updateContactEmailTemplate,
  deleteContactEmailTemplate,
  seedDefaultContactEmailTemplates,
  generateContactEmailDraft,
  DefaultTemplateProtectedError,
} = await import("./email-drafts");

await dbConnect();

const TEST_PREFIX = "vitest-contact-email-drafts-";

describe("contact email templates and drafts", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Email Drafts Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Email Drafts Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Email Drafts Co",
      industry: "Manufacturing",
      countriesServed: ["United Arab Emirates"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);
  });

  afterAll(async () => {
    await Promise.all([
      ContactEmailTemplate.deleteMany({ workspaceId }),
      Contact.deleteMany({ workspaceId }),
      ProjectOpportunity.deleteMany({ workspaceId }),
      TenderOpportunity.deleteMany({ workspaceId }),
      VendorRegistration.deleteMany({ workspaceId }),
      CompanyProfile.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("seeds the 7 default templates, and is idempotent on a second call", async () => {
    const first = await seedDefaultContactEmailTemplates(workspaceId);
    expect(first.created).toBe(7);

    const second = await seedDefaultContactEmailTemplates(workspaceId);
    expect(second.created).toBe(0);

    const templates = await listContactEmailTemplates(workspaceId);
    expect(templates.filter((t) => t.isDefault).length).toBe(7);
  });

  it("creates and edits a custom template", async () => {
    const created = await createContactEmailTemplate(workspaceId, {
      name: "My Custom Template",
      templateType: "CUSTOM",
      subject: "Hi {{contactName}}",
      body: "Hello {{contactName}} from {{ourCompanyName}}.",
    });
    expect(created.isDefault).toBe(false);

    const updated = await updateContactEmailTemplate(workspaceId, created.id, { subject: "Updated subject" });
    expect(updated.subject).toBe("Updated subject");
  });

  it("refuses to delete a default template but allows deleting a custom one", async () => {
    const templates = await listContactEmailTemplates(workspaceId);
    const defaultTemplate = templates.find((t) => t.isDefault);
    expect(defaultTemplate).toBeTruthy();
    await expect(deleteContactEmailTemplate(workspaceId, defaultTemplate!.id)).rejects.toThrow(DefaultTemplateProtectedError);

    const custom = await createContactEmailTemplate(workspaceId, { name: "Deletable", templateType: "CUSTOM", subject: "s", body: "b" });
    await expect(deleteContactEmailTemplate(workspaceId, custom.id)).resolves.toBeUndefined();
  });

  it("replaces every placeholder when generating a draft for a contact linked to a customer", async () => {
    const contact = await Contact.create({
      workspaceId,
      fullName: "Jane Smith",
      companyName: "ABC Pumps",
      country: "United Arab Emirates",
      sourceUrl: "https://abcpumps.example.com/procurement",
      sourceHistory: [],
    });
    const template = await createContactEmailTemplate(workspaceId, {
      name: "Placeholder Test",
      templateType: "CUSTOM",
      subject: "Hello {{contactName}} at {{companyName}}",
      body: "Dear {{contactName}}, we at {{ourCompanyName}} offer {{productService}} for {{country}}{{sourceContext}}.",
    });

    const draft = await generateContactEmailDraft(workspaceId, { contactId: contact.id, templateId: template.id, productService: "Centrifugal Pumps" });

    expect(draft.subject).toBe("Hello Jane Smith at ABC Pumps");
    expect(draft.body).toContain("Dear Jane Smith");
    expect(draft.body).toContain("Email Drafts Co");
    expect(draft.body).toContain("Centrifugal Pumps");
    expect(draft.body).toContain("United Arab Emirates");
    expect(draft.body).toContain("abcpumps.example.com");
    expect(draft.body).not.toContain("{{");
  });

  it("resolves matchedOpportunity for a vendor-registration-linked contact", async () => {
    const registration = await VendorRegistration.create({
      workspaceId,
      customerName: "SABIC",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
    });
    const contact = await Contact.create({
      workspaceId,
      fullName: "Vendor Contact",
      relatedVendorRegistrationId: registration.id,
      sourceHistory: [],
    });
    const template = await createContactEmailTemplate(workspaceId, {
      name: "Vendor Test",
      templateType: "VENDOR_REGISTRATION",
      subject: "Re: {{matchedOpportunity}}",
      body: "Regarding {{matchedOpportunity}}.",
    });

    const draft = await generateContactEmailDraft(workspaceId, { contactId: contact.id, templateId: template.id });
    expect(draft.subject).toContain("SABIC vendor registration");
  });

  it("resolves matchedOpportunity for a tender-opportunity-linked contact", async () => {
    const tender = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Public Works",
      tenderTitle: "Pipe Supply Tender",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-2",
      discoveryRunId: "run-2",
    });
    const contact = await Contact.create({
      workspaceId,
      fullName: "Tender Contact",
      relatedTenderOpportunityId: tender.id,
      sourceHistory: [],
    });
    const template = await createContactEmailTemplate(workspaceId, {
      name: "Tender Test",
      templateType: "TENDER_FOLLOW_UP",
      subject: "Re: {{matchedOpportunity}}",
      body: "Regarding {{matchedOpportunity}}.",
    });

    const draft = await generateContactEmailDraft(workspaceId, { contactId: contact.id, templateId: template.id });
    expect(draft.subject).toContain("Pipe Supply Tender");
  });

  it("has no email-sending function anywhere in this module's exports", async () => {
    const moduleExports = await import("./email-drafts");
    const exportNames = Object.keys(moduleExports);
    expect(exportNames.some((name) => /send/i.test(name))).toBe(false);
  });
});
