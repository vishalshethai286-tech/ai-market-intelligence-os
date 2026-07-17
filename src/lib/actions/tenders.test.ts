import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderBuyer, TenderOpportunity, RawSearchResult, CompanyProfile, ProductService } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const {
  processTenderResultsAction,
  updateTenderBuyerStatusAction,
  updateTenderOpportunityStatusAction,
  updateExpiredTendersAction,
} = await import("./tenders");

await dbConnect();

const TEST_PREFIX = "vitest-tender-actions-";

describe("tender actions", () => {
  let userId: string;
  let workspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Tender Actions" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Tender Actions Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Tender Actions Co",
      industry: "Manufacturing",
      countriesServed: ["USA"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Stainless Steel Pipes",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["Government"],
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
      TenderBuyer.deleteMany({ workspaceId }),
      TenderOpportunity.deleteMany({ workspaceId }),
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

  it("processTenderResultsAction turns a queued raw tender result into a TenderOpportunity", async () => {
    await RawSearchResult.create({
      workspaceId,
      discoveryRunId: "run-1",
      discoveryRunItemId: "item-1",
      searchQueryId: "query-1",
      searchQueueItemId: "queue-1",
      searchType: "TENDER",
      query: "stainless steel pipes tender USA",
      title: "Tender for Stainless Steel Pipes and Fittings",
      snippet: "Public Works Department invites bids for the supply of stainless steel pipes and fittings.",
      url: "https://tenders.example.gov/action-test-pipes",
      domain: "tenders.example.gov",
      country: "USA",
      sourceProvider: "MOCK",
      retrievedAt: new Date(),
      processedStatus: "UNPROCESSED",
      extractionStatus: "NOT_STARTED",
    });

    const result = await processTenderResultsAction({ batchSize: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenderOpportunitiesCreated).toBeGreaterThanOrEqual(1);
    }
  });

  it("updateTenderBuyerStatusAction updates status and is ownership-checked", async () => {
    const buyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Status Test Buyer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateTenderBuyerStatusAction(buyer.id, "APPROVED");
    expect(result.ok).toBe(true);

    const updated = await TenderBuyer.findById(buyer.id);
    expect(updated?.status).toBe("APPROVED");
  });

  it("updateTenderBuyerStatusAction fails for a buyer id from another workspace", async () => {
    const otherWorkspace = await createWorkspaceWithOwner("Tender Actions Other Co", userId);
    const otherBuyer = await TenderBuyer.create({
      workspaceId: otherWorkspace.id,
      customerName: "Cross Workspace Buyer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateTenderBuyerStatusAction(otherBuyer.id, "APPROVED");
    expect(result.ok).toBe(false);

    await TenderBuyer.deleteMany({ workspaceId: otherWorkspace.id });
    await Workspace.deleteOne({ _id: otherWorkspace.id });
  });

  it("updateTenderOpportunityStatusAction updates status and is ownership-checked", async () => {
    const opportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Status Test Authority",
      tenderTitle: "Status Test Tender",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateTenderOpportunityStatusAction(opportunity.id, "ELIGIBLE");
    expect(result.ok).toBe(true);

    const updated = await TenderOpportunity.findById(opportunity.id);
    expect(updated?.status).toBe("ELIGIBLE");
  });

  it("updateExpiredTendersAction marks past-endDate tenders as EXPIRED", async () => {
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const opportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Expiry Action Authority",
      tenderTitle: "Expiry Action Tender",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
      endDate: pastDate,
    });

    const result = await updateExpiredTendersAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expired).toBeGreaterThanOrEqual(1);
    }

    const updated = await TenderOpportunity.findById(opportunity.id);
    expect(updated?.status).toBe("EXPIRED");
  });
});
