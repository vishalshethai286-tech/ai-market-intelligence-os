import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, ProjectOpportunity, TenderOpportunity, VendorRegistration, DuplicateRecord, Contact } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  getDailyReport,
  getWeeklyReport,
  getCountryWiseReport,
  getProductWiseReport,
  getDuplicateReport,
  getTenderExpiryReport,
  getVendorRegistrationReport,
  getContactReport,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-reports-service-";

describe("reports service", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Reports" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Reports Co", userId);
    workspaceId = workspace.id;

    await TargetCustomer.create({
      workspaceId,
      customerName: "Reports Customer",
      country: "USA",
      matchedProductServiceName: "Centrifugal Pump",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await ProjectOpportunity.create({
      workspaceId,
      clientName: "Reports Project Client",
      projectName: "Reports Project",
      country: "USA",
      matchedProductServiceName: "Centrifugal Pump",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await VendorRegistration.create({
      workspaceId,
      customerName: "Reports Vendor",
      country: "India",
      status: "APPROVED",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Reports Authority",
      tenderTitle: "Reports Tender Active",
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "NEW",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Reports Authority",
      tenderTitle: "Reports Tender Expiring Soon",
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: "NEW",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Reports Authority",
      tenderTitle: "Reports Tender Expired",
      endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: "NEW",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: "id-a",
      duplicateRecordId: "id-b",
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });
    await Contact.create({
      workspaceId,
      fullName: "Reports Manual Contact",
      sourceType: "MANUAL_ENTRY",
      sourceHistory: [],
      confidenceScore: 0.9,
      status: "NEW",
    });
    await Contact.create({
      workspaceId,
      fullName: "Reports Public Contact",
      sourceType: "PROCUREMENT_PAGE",
      confidenceScore: 0.3,
      relatedTargetCustomerId: "reports-linked-customer",
      sourceHistory: [],
      status: "NEW",
    });
  });

  afterAll(async () => {
    await Promise.all([
      TargetCustomer.deleteMany({ workspaceId }),
      ProjectOpportunity.deleteMany({ workspaceId }),
      TenderOpportunity.deleteMany({ workspaceId }),
      VendorRegistration.deleteMany({ workspaceId }),
      DuplicateRecord.deleteMany({ workspaceId }),
      Contact.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("getDailyReport counts records created within the last 24 hours", async () => {
    const report = await getDailyReport(workspaceId);
    expect(report.customersCreated).toBeGreaterThanOrEqual(1);
    expect(report.projectsCreated).toBeGreaterThanOrEqual(1);
    expect(report.vendorRegistrationsCreated).toBeGreaterThanOrEqual(1);
    expect(report.duplicatesFound).toBeGreaterThanOrEqual(1);
  });

  it("getWeeklyReport counts records created within the last 7 days", async () => {
    const report = await getWeeklyReport(workspaceId);
    expect(report.customersCreated).toBeGreaterThanOrEqual(1);
    expect(report.liveTendersCreated).toBeGreaterThanOrEqual(3);
  });

  it("getCountryWiseReport aggregates counts per country across every entity type", async () => {
    const rows = await getCountryWiseReport(workspaceId);
    const usa = rows.find((r) => r.country === "USA");
    const india = rows.find((r) => r.country === "India");
    expect(usa?.customers).toBeGreaterThanOrEqual(1);
    expect(usa?.projects).toBeGreaterThanOrEqual(1);
    expect(india?.vendorRegistrations).toBeGreaterThanOrEqual(1);
  });

  it("getProductWiseReport aggregates counts per matched product/service", async () => {
    const rows = await getProductWiseReport(workspaceId);
    const pump = rows.find((r) => r.productServiceName === "Centrifugal Pump");
    expect(pump?.customers).toBeGreaterThanOrEqual(1);
    expect(pump?.projects).toBeGreaterThanOrEqual(1);
  });

  it("getDuplicateReport breaks down DuplicateRecord status counts per recordType", async () => {
    const rows = await getDuplicateReport(workspaceId);
    const customerRow = rows.find((r) => r.recordType === "CUSTOMER");
    expect(customerRow?.pendingReview).toBeGreaterThanOrEqual(1);
  });

  it("getTenderExpiryReport reports active/expiring/expired tender counts", async () => {
    const report = await getTenderExpiryReport(workspaceId);
    expect(report.active).toBeGreaterThanOrEqual(2);
    expect(report.expiringIn7Days).toBeGreaterThanOrEqual(1);
    expect(report.expired).toBeGreaterThanOrEqual(1);
  });

  it("getVendorRegistrationReport reports counts by status", async () => {
    const report = await getVendorRegistrationReport(workspaceId);
    expect(report.approved).toBeGreaterThanOrEqual(1);
  });

  it("getContactReport splits publicly-discovered vs manually-added contacts, by discovery target type, and needing verification", async () => {
    const report = await getContactReport(workspaceId);
    expect(report.total).toBeGreaterThanOrEqual(2);
    expect(report.publiclyDiscovered).toBeGreaterThanOrEqual(1);
    expect(report.manuallyAdded).toBeGreaterThanOrEqual(1);
    expect(report.byDiscoveryTargetType.TARGET_CUSTOMER).toBeGreaterThanOrEqual(1);
    expect(report.byDiscoveryTargetType.NONE).toBeGreaterThanOrEqual(1);
    expect(report.needingVerification).toBeGreaterThanOrEqual(1);
  });
});
