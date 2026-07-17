import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  CompanyProfile,
  ProductService,
  SearchQuery,
  SearchQueueItem,
  DiscoveryBrain,
  DiscoveryStrategy,
  CountryCoverage,
  IndustryCoverage,
  ProductCoverage,
  CoverageSnapshot,
  DiscoveryRun,
  DiscoveryRunItem,
  RawSearchResult,
  SearchProviderLog,
  DiscoveryErrorLog,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { generateDiscoveryQueue } = await import("./service");
const { executeDiscoveryRun, DiscoveryBrainNotReadyError } = await import("./executor");

await dbConnect();

const TEST_PREFIX = "vitest-discovery-executor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    SearchQuery.deleteMany({ workspaceId }),
    SearchQueueItem.deleteMany({ workspaceId }),
    DiscoveryBrain.deleteMany({ workspaceId }),
    DiscoveryStrategy.deleteMany({ workspaceId }),
    CountryCoverage.deleteMany({ workspaceId }),
    IndustryCoverage.deleteMany({ workspaceId }),
    ProductCoverage.deleteMany({ workspaceId }),
    CoverageSnapshot.deleteMany({ workspaceId }),
    DiscoveryRun.deleteMany({ workspaceId }),
    DiscoveryRunItem.deleteMany({ workspaceId }),
    RawSearchResult.deleteMany({ workspaceId }),
    SearchProviderLog.deleteMany({ workspaceId }),
    DiscoveryErrorLog.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

describe("discovery run executor", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let noQueueWorkspaceId: string;

  beforeAll(async () => {
    process.env.ENABLE_MOCK_SEARCH = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Executor" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Executor Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Acme Pumps",
      industry: "Manufacturing",
      operationType: "MANUFACTURER",
      countriesServed: ["United States"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["OEM"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);
    await generateDiscoveryQueue(workspaceId);

    const otherWorkspace = await createWorkspaceWithOwner("Executor Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
    await CompanyProfile.create({
      workspaceId: otherWorkspaceId,
      companyName: "Other Co",
      industry: "Logistics",
      countriesServed: ["India"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId: otherWorkspaceId,
      name: "Freight Forwarding",
      type: "SERVICE",
      targetIndustries: ["Logistics"],
      buyerTypes: ["Distributor"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(otherWorkspaceId);
    await generateDiscoveryQueue(otherWorkspaceId);

    const noQueueWorkspace = await createWorkspaceWithOwner("Executor No Queue Co", userId);
    noQueueWorkspaceId = noQueueWorkspace.id;
  });

  afterAll(async () => {
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await cleanupWorkspace(noQueueWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("throws DiscoveryBrainNotReadyError when the queue has never been generated", async () => {
    await expect(executeDiscoveryRun(noQueueWorkspaceId)).rejects.toThrow(DiscoveryBrainNotReadyError);
  });

  it("executes queued searches, stores raw results, and marks the run COMPLETED", async () => {
    const beforeQueued = await SearchQueueItem.countDocuments({ workspaceId, status: "QUEUED" });
    expect(beforeQueued).toBeGreaterThan(0);

    const result = await executeDiscoveryRun(workspaceId, { maxQueueItems: 3 });

    expect(result.status).toBe("COMPLETED");
    expect(result.queriesExecuted).toBe(3);
    expect(result.rawResultsFound).toBeGreaterThan(0);
    expect(result.errorsCount).toBe(0);

    const run = await DiscoveryRun.findById(result.discoveryRunId);
    expect(run?.status).toBe("COMPLETED");
    expect(run?.queriesExecuted).toBe(3);
    expect(run?.finishedAt).not.toBeNull();

    const runItems = await DiscoveryRunItem.find({ discoveryRunId: result.discoveryRunId });
    expect(runItems.length).toBe(3);
    expect(runItems.every((item) => item.status === "COMPLETED")).toBe(true);

    const rawResults = await RawSearchResult.find({ discoveryRunId: result.discoveryRunId });
    expect(rawResults.length).toBe(result.rawResultsFound);
    for (const raw of rawResults) {
      expect(raw.sourceProvider).toBe("MOCK");
      expect(raw.processedStatus).toBe("UNPROCESSED");
      expect(raw.extractionStatus).toBe("NOT_STARTED");
    }

    const coveredQueueItems = await SearchQueueItem.countDocuments({ workspaceId, status: "COVERED" });
    expect(coveredQueueItems).toBe(3);
    const coveredQueries = await SearchQuery.countDocuments({ workspaceId, status: "COVERED" });
    expect(coveredQueries).toBe(3);
  });

  it("is workspace-isolated — never touches or returns another workspace's queue/results", async () => {
    const before = await SearchQueueItem.countDocuments({ workspaceId: otherWorkspaceId, status: "COVERED" });
    expect(before).toBe(0);

    // Running discovery for `workspaceId` again must not affect otherWorkspaceId's queue at all.
    await executeDiscoveryRun(workspaceId, { maxQueueItems: 1 });

    const after = await SearchQueueItem.countDocuments({ workspaceId: otherWorkspaceId, status: "COVERED" });
    expect(after).toBe(0);
  });

  it("filters by searchType — only matching queue items are executed", async () => {
    const result = await executeDiscoveryRun(otherWorkspaceId, { searchType: "TENDER", maxQueueItems: 50 });
    expect(result.status).toBe("COMPLETED");

    const items = await DiscoveryRunItem.find({ discoveryRunId: result.discoveryRunId });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.searchType === "TENDER")).toBe(true);
  });

  it("logs a retryable-vs-not-retryable error and leaves the queue item retryable when appropriate", async () => {
    vi.stubEnv("ENABLE_MOCK_SEARCH", "false");
    vi.stubEnv("SEARCH_PROVIDER", "google_cse");
    vi.stubEnv("GOOGLE_CSE_API_KEY", "");
    vi.stubEnv("GOOGLE_CSE_CX", "");
    vi.stubEnv("NODE_ENV", "production");

    const queuedBefore = await SearchQueueItem.findOne({ workspaceId: otherWorkspaceId, status: "QUEUED" });
    expect(queuedBefore).not.toBeNull();

    const result = await executeDiscoveryRun(otherWorkspaceId, { maxQueueItems: 1 });

    expect(result.errorsCount).toBe(1);
    expect(result.queriesExecuted).toBe(0);

    const errorLog = await DiscoveryErrorLog.findOne({ discoveryRunId: result.discoveryRunId });
    expect(errorLog).not.toBeNull();
    expect(errorLog?.errorType).toBe("PROVIDER_NOT_CONFIGURED");
    expect(errorLog?.retryable).toBe(false);

    const runItem = await DiscoveryRunItem.findOne({ discoveryRunId: result.discoveryRunId });
    expect(runItem?.status).toBe("FAILED");

    const queueItemAfter = await SearchQueueItem.findById(queuedBefore!.id);
    expect(queueItemAfter?.status).toBe("FAILED");
  });
});
