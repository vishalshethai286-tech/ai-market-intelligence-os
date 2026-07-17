import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, ProjectOpportunity, TenderBuyer, TenderOpportunity, VendorRegistration, Contact, DuplicateRecord } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");

const { GET: getCustomersCsv } = await import("./customers/route");
const { GET: getProjectsCsv } = await import("./projects/route");
const { GET: getTenderBuyersCsv } = await import("./tender-buyers/route");
const { GET: getLiveTendersCsv } = await import("./live-tenders/route");
const { GET: getVendorRegistrationsCsv } = await import("./vendor-registrations/route");
const { GET: getContactsCsv } = await import("./contacts/route");
const { GET: getDuplicatesCsv } = await import("./duplicates/route");

await dbConnect();

const TEST_PREFIX = "vitest-exports-";

describe("CSV export routes", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Exports" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Exports Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Exports Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    await TargetCustomer.create({
      workspaceId,
      customerName: "Export Customer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [{ url: "https://export-customer.example/source", rawSearchResultId: "raw", discoveryRunId: "run", retrievedAt: new Date() }],
      status: "NEW",
    });
    await ProjectOpportunity.create({
      workspaceId,
      clientName: "Export Client",
      projectName: "Export Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await TenderBuyer.create({
      workspaceId,
      customerName: "Export Tender Buyer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Export Tender Authority",
      tenderTitle: "Export Tender",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await VendorRegistration.create({
      workspaceId,
      customerName: "Export Vendor",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await Contact.create({
      workspaceId,
      fullName: "Export Contact",
      email: "export-contact@example.com",
      sourceHistory: [{ url: "https://export-contact.example/source", sourceType: "COMPANY_WEBSITE", note: null, retrievedAt: new Date() }],
      status: "NEW",
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: "id-a",
      duplicateRecordId: "id-b",
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });

    // Other workspace's data — must never leak into the first workspace's export.
    await TargetCustomer.create({ workspaceId: otherWorkspaceId, customerName: "Other Workspace Customer", rawSearchResultId: "raw", discoveryRunId: "run", sourceHistory: [], status: "NEW" });
    await ProjectOpportunity.create({ workspaceId: otherWorkspaceId, clientName: "Other Client", projectName: "Other Project", rawSearchResultId: "raw", discoveryRunId: "run", sourceHistory: [], status: "NEW" });
    await TenderBuyer.create({ workspaceId: otherWorkspaceId, customerName: "Other Tender Buyer", rawSearchResultId: "raw", discoveryRunId: "run", sourceHistory: [], status: "NEW" });
    await TenderOpportunity.create({ workspaceId: otherWorkspaceId, buyerOrganization: "Other Authority", tenderTitle: "Other Tender", rawSearchResultId: "raw", discoveryRunId: "run", sourceHistory: [], status: "NEW" });
    await VendorRegistration.create({ workspaceId: otherWorkspaceId, customerName: "Other Workspace Vendor", rawSearchResultId: "raw", discoveryRunId: "run", sourceHistory: [], status: "NEW" });
    await Contact.create({ workspaceId: otherWorkspaceId, fullName: "Other Workspace Contact", email: "other-workspace-contact@example.com", status: "NEW" });
    await DuplicateRecord.create({ workspaceId: otherWorkspaceId, recordType: "CUSTOMER", primaryRecordId: "id-c", duplicateRecordId: "id-d", duplicateScore: 80, status: "PENDING_REVIEW" });
  });

  afterAll(async () => {
    await Promise.all([
      TargetCustomer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      ProjectOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      TenderBuyer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      TenderOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      VendorRegistration.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      Contact.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      DuplicateRecord.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  it("customers export returns CSV with the workspace's data and correct headers, excluding other workspaces", async () => {
    const response = await getCustomersCsv();
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("customers.csv");
    const body = await response.text();
    expect(body).toContain("Export Customer");
    expect(body).toContain("https://export-customer.example/source");
    expect(body).not.toContain("Other Workspace Customer");
  });

  it("projects export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getProjectsCsv();
    const body = await response.text();
    expect(body).toContain("Export Client");
    expect(body).not.toContain("Other Client");
  });

  it("tender buyers export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getTenderBuyersCsv();
    const body = await response.text();
    expect(body).toContain("Export Tender Buyer");
    expect(body).not.toContain("Other Tender Buyer");
  });

  it("live tenders export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getLiveTendersCsv();
    const body = await response.text();
    expect(body).toContain("Export Tender Authority");
    expect(body).not.toContain("Other Authority");
  });

  it("vendor registrations export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getVendorRegistrationsCsv();
    const body = await response.text();
    expect(body).toContain("Export Vendor");
    expect(body).not.toContain("Other Workspace Vendor");
  });

  it("contacts export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getContactsCsv();
    const body = await response.text();
    expect(body).toContain("Export Contact");
    expect(body).toContain("https://export-contact.example/source");
    expect(body).not.toContain("Other Workspace Contact");
  });

  it("duplicate records export returns CSV with the workspace's data, excluding other workspaces", async () => {
    const response = await getDuplicatesCsv();
    const body = await response.text();
    expect(body).toContain("id-a");
    expect(body).not.toContain("id-c");
  });

  it("returns 401 when there's no active workspace", async () => {
    mockCookies.mockResolvedValue({ get: () => undefined });
    mockAuth.mockResolvedValue(null);
    const response = await getCustomersCsv();
    expect(response.status).toBe(401);
  });
});
