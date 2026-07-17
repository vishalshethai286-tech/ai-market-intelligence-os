import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, TargetCustomer, RawSearchResult, SearchQuery, ContactDiscoveryTarget, Contact } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const {
  generateContactDiscoveryTargetsAction,
  generateContactSearchQueueAction,
  processContactResultsAction,
  updateContactDiscoveryTargetStatusAction,
} = await import("./contact-discovery");

await dbConnect();

const TEST_PREFIX = "vitest-contact-discovery-actions-";

describe("contact discovery actions", () => {
  let userId: string;
  let workspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Discovery Actions Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Discovery Actions Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Contact Discovery Actions Co",
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
      TargetCustomer.deleteMany({ workspaceId }),
      RawSearchResult.deleteMany({ workspaceId }),
      SearchQuery.deleteMany({ workspaceId }),
      ContactDiscoveryTarget.deleteMany({ workspaceId }),
      Contact.deleteMany({ workspaceId }),
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

  it("generateContactDiscoveryTargetsAction creates a target from an approved TargetCustomer", async () => {
    await TargetCustomer.create({
      workspaceId,
      customerName: "ADNOC Actions Test",
      country: "United Arab Emirates",
      priority: "A_PLUS",
      status: "APPROVED",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
      sourceHistory: [],
      duplicateStatus: "UNIQUE",
    });

    const result = await generateContactDiscoveryTargetsAction();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.targetsCreated).toBeGreaterThanOrEqual(1);

    const target = await ContactDiscoveryTarget.findOne({ workspaceId, companyName: "ADNOC Actions Test" });
    expect(target).not.toBeNull();
  });

  it("generateContactSearchQueueAction creates CONTACT-searchType queries for queued targets", async () => {
    const result = await generateContactSearchQueueAction();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.queriesCreated).toBeGreaterThan(0);

    const query = await SearchQuery.findOne({ workspaceId, searchType: "CONTACT" });
    expect(query).not.toBeNull();
  });

  it("processContactResultsAction turns a queued raw contact result into a Contact", async () => {
    const searchQuery = await SearchQuery.findOne({ workspaceId, searchType: "CONTACT" });
    await RawSearchResult.create({
      workspaceId,
      discoveryRunId: "run-1",
      discoveryRunItemId: "item-1",
      searchQueryId: searchQuery?.id ?? "query-1",
      searchQueueItemId: "queue-1",
      searchType: "CONTACT",
      query: "ADNOC procurement contact",
      title: "Procurement Contacts | ADNOC Actions Test",
      snippet: "",
      url: "https://adnoc-actions-test.example.com/procurement",
      domain: "adnoc-actions-test.example.com",
      country: "United Arab Emirates",
      sourceProvider: "MOCK",
      retrievedAt: new Date(),
      processedStatus: "UNPROCESSED",
      extractionStatus: "NOT_STARTED",
    });

    const result = await processContactResultsAction({ batchSize: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contactsCreated).toBeGreaterThanOrEqual(1);
  });

  it("updateContactDiscoveryTargetStatusAction updates status and is ownership-checked", async () => {
    const target = await ContactDiscoveryTarget.findOne({ workspaceId, companyName: "ADNOC Actions Test" });
    const result = await updateContactDiscoveryTargetStatusAction(target!.id, "ARCHIVED");
    expect(result.ok).toBe(true);

    const updated = await ContactDiscoveryTarget.findById(target!.id);
    expect(updated?.status).toBe("ARCHIVED");
  });

  it("updateContactDiscoveryTargetStatusAction fails for a target id from another workspace", async () => {
    const otherWorkspace = await createWorkspaceWithOwner("Contact Discovery Actions Other Co", userId);
    const otherTarget = await ContactDiscoveryTarget.create({
      workspaceId: otherWorkspace.id,
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: "other-customer",
      companyName: "Cross Workspace Co",
    });

    const result = await updateContactDiscoveryTargetStatusAction(otherTarget.id, "ARCHIVED");
    expect(result.ok).toBe(false);

    await ContactDiscoveryTarget.deleteMany({ workspaceId: otherWorkspace.id });
    await Workspace.deleteOne({ _id: otherWorkspace.id });
  });
});
