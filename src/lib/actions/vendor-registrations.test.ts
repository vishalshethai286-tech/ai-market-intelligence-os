import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration, RawSearchResult, CompanyProfile, ProductService } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processVendorRegistrationResultsAction, updateVendorRegistrationStatusAction } = await import("./vendor-registrations");

await dbConnect();

const TEST_PREFIX = "vitest-vendor-registration-actions-";

describe("vendor registration actions", () => {
  let userId: string;
  let workspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Vendor Registration Actions" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Vendor Registration Actions Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Vendor Registration Actions Co",
      industry: "Manufacturing",
      countriesServed: ["United Arab Emirates"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["EPC Contractor"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await Promise.all([
      VendorRegistration.deleteMany({ workspaceId }),
      RawSearchResult.deleteMany({ workspaceId }),
      ProductService.deleteMany({ workspaceId }),
      CompanyProfile.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  it("processVendorRegistrationResultsAction turns a queued raw vendor registration result into a VendorRegistration", async () => {
    await RawSearchResult.create({
      workspaceId,
      discoveryRunId: "run-1",
      discoveryRunItemId: "item-1",
      searchQueryId: "query-1",
      searchQueueItemId: "queue-1",
      searchType: "VENDOR_REGISTRATION",
      query: "supplier registration UAE",
      title: "Supplier Registration | ADNOC",
      snippet: "Company profile and ISO certificate are required for supplier registration.",
      url: "https://adnoc-action-test.example.com/register",
      domain: "adnoc-action-test.example.com",
      country: "United Arab Emirates",
      sourceProvider: "MOCK",
      retrievedAt: new Date(),
      processedStatus: "UNPROCESSED",
      extractionStatus: "NOT_STARTED",
    });

    const result = await processVendorRegistrationResultsAction({ batchSize: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vendorRegistrationsCreated).toBeGreaterThanOrEqual(1);
    }
  });

  it("updateVendorRegistrationStatusAction updates status and is ownership-checked", async () => {
    const registration = await VendorRegistration.create({
      workspaceId,
      customerName: "Status Test Vendor",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateVendorRegistrationStatusAction(registration.id, "APPROVED");
    expect(result.ok).toBe(true);

    const updated = await VendorRegistration.findById(registration.id);
    expect(updated?.status).toBe("APPROVED");
  });

  it("updateVendorRegistrationStatusAction fails for a registration id from another workspace", async () => {
    const otherWorkspace = await createWorkspaceWithOwner("Vendor Registration Actions Other Co", userId);
    const otherRegistration = await VendorRegistration.create({
      workspaceId: otherWorkspace.id,
      customerName: "Cross Workspace Vendor",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateVendorRegistrationStatusAction(otherRegistration.id, "APPROVED");
    expect(result.ok).toBe(false);

    await VendorRegistration.deleteMany({ workspaceId: otherWorkspace.id });
    await Workspace.deleteOne({ _id: otherWorkspace.id });
  });
});
