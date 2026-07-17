import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  Contact,
  TargetCustomer,
  ProjectOpportunity,
  TenderBuyer,
  TenderOpportunity,
  VendorRegistration,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  getBestContactsForTargetCustomer,
  getBestContactsForProject,
  getBestContactsForTenderBuyer,
  getBestContactsForTenderOpportunity,
  getBestContactsForVendorRegistration,
  getMissingContactRolesForEntity,
} = await import("./recommendations");

await dbConnect();

const TEST_PREFIX = "vitest-contact-recommendations-";

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    Contact.deleteMany({ workspaceId }),
    TargetCustomer.deleteMany({ workspaceId }),
    ProjectOpportunity.deleteMany({ workspaceId }),
    TenderBuyer.deleteMany({ workspaceId }),
    TenderOpportunity.deleteMany({ workspaceId }),
    VendorRegistration.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

describe("contact recommendations", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  let customerId: string;
  let projectId: string;
  let tenderBuyerId: string;
  let tenderOpportunityId: string;
  let vendorRegistrationId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Recommendations Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Recommendations Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Recommendations Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "ADNOC Recs",
      country: "UAE",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-customer",
      discoveryRunId: "run-customer",
    });
    customerId = customer.id;
    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "SABIC Recs",
      projectName: "New Plant",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-project",
      discoveryRunId: "run-project",
    });
    projectId = project.id;
    const tenderBuyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Qatar Energy Recs",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-tender-buyer",
      discoveryRunId: "run-tender-buyer",
    });
    tenderBuyerId = tenderBuyer.id;
    const tenderOpportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Public Works Recs",
      tenderTitle: "Supply Tender",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-tender-opp",
      discoveryRunId: "run-tender-opp",
    });
    tenderOpportunityId = tenderOpportunity.id;
    const vendorRegistration = await VendorRegistration.create({
      workspaceId,
      customerName: "Industrial Pumps Recs",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-vendor-reg",
      discoveryRunId: "run-vendor-reg",
    });
    vendorRegistrationId = vendorRegistration.id;

    // Low-value contact: OTHER role, no email/phone.
    await Contact.create({
      workspaceId,
      fullName: "Low Value Contact",
      roleCategory: "OTHER",
      relatedTargetCustomerId: customerId,
      relatedProjectOpportunityId: projectId,
      relatedTenderBuyerId: tenderBuyerId,
      relatedTenderOpportunityId: tenderOpportunityId,
      relatedVendorRegistrationId: vendorRegistrationId,
      sourceHistory: [],
    });

    // High-value contact per entity: matching recommended role, email+phone, high priority/enrichment.
    await Contact.create({
      workspaceId,
      fullName: "Procurement Champion",
      roleCategory: "PROCUREMENT",
      seniority: "MANAGER",
      email: "champion@example.com",
      phoneNumber: "+1 555 999 0000",
      priorityScore: 90,
      enrichmentScore: 90,
      confidenceScore: 0.9,
      relatedTargetCustomerId: customerId,
      sourceHistory: [],
    });
    await Contact.create({
      workspaceId,
      fullName: "Project Champion",
      roleCategory: "PROJECT_MANAGEMENT",
      seniority: "MANAGER",
      email: "pm@example.com",
      priorityScore: 85,
      enrichmentScore: 85,
      relatedProjectOpportunityId: projectId,
      sourceHistory: [],
    });
    await Contact.create({
      workspaceId,
      fullName: "Tendering Champion",
      roleCategory: "TENDERING",
      seniority: "HEAD",
      email: "tender@example.com",
      priorityScore: 88,
      enrichmentScore: 88,
      relatedTenderBuyerId: tenderBuyerId,
      relatedTenderOpportunityId: tenderOpportunityId,
      sourceHistory: [],
    });
    await Contact.create({
      workspaceId,
      fullName: "Vendor Champion",
      roleCategory: "VENDOR_MANAGEMENT",
      seniority: "MANAGER",
      email: "vendor@example.com",
      priorityScore: 87,
      enrichmentScore: 87,
      relatedVendorRegistrationId: vendorRegistrationId,
      sourceHistory: [],
    });
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("ranks the best contact for a TargetCustomer above a low-value linked contact", async () => {
    const result = await getBestContactsForTargetCustomer(workspaceId, customerId);
    expect(result.alert).toBeNull();
    expect(result.contacts[0].contact.fullName).toBe("Procurement Champion");
  });

  it("ranks the best contact for a ProjectOpportunity", async () => {
    const result = await getBestContactsForProject(workspaceId, projectId);
    expect(result.contacts[0].contact.fullName).toBe("Project Champion");
  });

  it("ranks the best contact for a TenderBuyer", async () => {
    const result = await getBestContactsForTenderBuyer(workspaceId, tenderBuyerId);
    expect(result.contacts[0].contact.fullName).toBe("Tendering Champion");
  });

  it("ranks the best contact for a TenderOpportunity", async () => {
    const result = await getBestContactsForTenderOpportunity(workspaceId, tenderOpportunityId);
    expect(result.contacts[0].contact.fullName).toBe("Tendering Champion");
  });

  it("ranks the best contact for a VendorRegistration", async () => {
    const result = await getBestContactsForVendorRegistration(workspaceId, vendorRegistrationId);
    expect(result.contacts[0].contact.fullName).toBe("Vendor Champion");
  });

  it("returns a 'no contact found' alert when a related record has no eligible contacts", async () => {
    const emptyCustomer = await TargetCustomer.create({
      workspaceId,
      customerName: "Empty Customer",
      status: "NEW",
      sourceHistory: [],
      rawSearchResultId: "raw-empty",
      discoveryRunId: "run-empty",
    });
    const result = await getBestContactsForTargetCustomer(workspaceId, emptyCustomer.id);
    expect(result.contacts).toEqual([]);
    expect(result.alert).toBe("No procurement contact found");
  });

  it("detects missing recommended contact roles for an entity", async () => {
    const missingRoles = await getMissingContactRolesForEntity(workspaceId, "TARGET_CUSTOMER", customerId);
    // Procurement is covered by "Procurement Champion"; Sourcing/Supply Chain/etc. are not.
    expect(missingRoles).not.toContain("PROCUREMENT");
    expect(missingRoles.length).toBeGreaterThan(0);
  });

  it("never recommends a contact from another workspace", async () => {
    await Contact.create({
      workspaceId: otherWorkspaceId,
      fullName: "Other Workspace Contact",
      roleCategory: "PROCUREMENT",
      relatedTargetCustomerId: customerId,
      sourceHistory: [],
    });
    const result = await getBestContactsForTargetCustomer(workspaceId, customerId);
    expect(result.contacts.some((r) => r.contact.fullName === "Other Workspace Contact")).toBe(false);
  });
});
