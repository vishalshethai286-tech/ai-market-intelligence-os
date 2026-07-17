import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  ContactDiscoveryTarget,
  TargetCustomer,
  ProjectOpportunity,
  TenderBuyer,
  TenderOpportunity,
  VendorRegistration,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { generateContactDiscoveryTargets } = await import("./targets");

await dbConnect();

const TEST_PREFIX = "vitest-contact-discovery-targets-";

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    ContactDiscoveryTarget.deleteMany({ workspaceId }),
    TargetCustomer.deleteMany({ workspaceId }),
    ProjectOpportunity.deleteMany({ workspaceId }),
    TenderBuyer.deleteMany({ workspaceId }),
    TenderOpportunity.deleteMany({ workspaceId }),
    VendorRegistration.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

describe("generateContactDiscoveryTargets", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("creates a target from each of the 5 related entity types", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Discovery Targets Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Discovery Targets Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Contact Discovery Targets Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "ADNOC",
      country: "United Arab Emirates",
      website: "https://adnoc-targets-test.example.com",
      websiteDomain: "adnoc-targets-test.example.com",
      priority: "A_PLUS",
      status: "APPROVED",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "SABIC",
      projectName: "New Pump Station",
      country: "Saudi Arabia",
      priority: "B",
      status: "REVIEWED",
      rawSearchResultId: "raw-2",
      discoveryRunId: "run-2",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const tenderBuyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Qatar Energy",
      website: "https://qatarenergy-targets-test.example.com",
      websiteDomain: "qatarenergy-targets-test.example.com",
      country: "Qatar",
      status: "APPROVED",
      rawSearchResultId: "raw-3",
      discoveryRunId: "run-3",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const tenderOpportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Public Works Department",
      tenderTitle: "Supply of Industrial Pumps",
      country: "India",
      status: "ELIGIBLE",
      rawSearchResultId: "raw-4",
      discoveryRunId: "run-4",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const vendorRegistration = await VendorRegistration.create({
      workspaceId,
      customerName: "Industrial Pumps Inc.",
      website: "https://industrialpumps-targets-test.example.com",
      websiteDomain: "industrialpumps-targets-test.example.com",
      country: "United States",
      status: "SUBMITTED",
      rawSearchResultId: "raw-5",
      discoveryRunId: "run-5",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const summary = await generateContactDiscoveryTargets(workspaceId);
    expect(summary.targetsCreated).toBeGreaterThanOrEqual(5);

    const customerTarget = await ContactDiscoveryTarget.findOne({ workspaceId, relatedRecordType: "TARGET_CUSTOMER", relatedRecordId: customer.id });
    expect(customerTarget?.companyName).toBe("ADNOC");
    expect(customerTarget?.priority).toBe("A_PLUS");

    const projectTarget = await ContactDiscoveryTarget.findOne({ workspaceId, relatedRecordType: "PROJECT_OPPORTUNITY", relatedRecordId: project.id });
    expect(projectTarget?.companyName).toBe("SABIC");

    const tenderBuyerTarget = await ContactDiscoveryTarget.findOne({ workspaceId, relatedRecordType: "TENDER_BUYER", relatedRecordId: tenderBuyer.id });
    expect(tenderBuyerTarget?.companyName).toBe("Qatar Energy");
    expect(tenderBuyerTarget?.priority).toBe("A");

    const tenderOpportunityTarget = await ContactDiscoveryTarget.findOne({
      workspaceId,
      relatedRecordType: "TENDER_OPPORTUNITY",
      relatedRecordId: tenderOpportunity.id,
    });
    expect(tenderOpportunityTarget?.companyName).toBe("Public Works Department");

    const vendorRegistrationTarget = await ContactDiscoveryTarget.findOne({
      workspaceId,
      relatedRecordType: "VENDOR_REGISTRATION",
      relatedRecordId: vendorRegistration.id,
    });
    expect(vendorRegistrationTarget?.companyName).toBe("Industrial Pumps Inc.");
    expect(vendorRegistrationTarget?.priority).toBe("A");
  });

  it("does not duplicate targets on a second run when nothing changed", async () => {
    const first = await generateContactDiscoveryTargets(workspaceId);
    expect(first.targetsCreated).toBe(0);

    const second = await generateContactDiscoveryTargets(workspaceId);
    expect(second.targetsCreated).toBe(0);
    expect(second.duplicatesSkipped).toBeGreaterThan(0);
  });

  it("updates an existing target in place when the source record's priority/status changes", async () => {
    await TargetCustomer.findOneAndUpdate({ workspaceId, customerName: "ADNOC" }, { priority: "B", status: "REVIEWED" });

    const summary = await generateContactDiscoveryTargets(workspaceId);
    expect(summary.targetsUpdated).toBeGreaterThanOrEqual(1);

    const updated = await ContactDiscoveryTarget.findOne({ workspaceId, companyName: "ADNOC" });
    expect(updated?.priority).toBe("B");
    expect(updated?.sourceEntityStatus).toBe("REVIEWED");
  });

  it("is workspace-isolated — never creates targets from another workspace's records", async () => {
    await TargetCustomer.create({
      workspaceId: otherWorkspaceId,
      customerName: "Other Workspace Co",
      country: "Germany",
      priority: "A",
      status: "APPROVED",
      rawSearchResultId: "raw-other",
      discoveryRunId: "run-other",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    await generateContactDiscoveryTargets(workspaceId);

    const leaked = await ContactDiscoveryTarget.findOne({ workspaceId, companyName: "Other Workspace Co" });
    expect(leaked).toBeNull();
  });
});
