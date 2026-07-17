import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, TargetCompany, UsageLog } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { runDiscoveryForWorkspace, runDiscoveryForAllWorkspaces } = await import("./service");
const { cleanupOrphanedTestRecords } = await import("@/lib/test-utils/cleanup-orphaned-records");

await dbConnect();

const TEST_PREFIX = "vitest-discovery-";

async function seedReadyWorkspace(userId: string, name: string) {
  const workspace = await createWorkspaceWithOwner(name, userId);
  await CompanyProfile.create({
    workspaceId: workspace.id,
    companyName: name,
    industry: "Manufacturing",
    countriesServed: ["United States"],
    confidenceScore: 0.9,
    sourceUrls: [],
    status: "APPROVED",
  });
  await ProductService.create({
    workspaceId: workspace.id,
    name: "Centrifugal Pump",
    type: "PRODUCT",
    targetIndustries: ["Oil & Gas"],
    buyerTypes: ["OEM"],
    sourceUrls: [],
    confidenceScore: 0.9,
    status: "APPROVED",
  });
  await buildInitialBrain(workspace.id);
  return workspace;
}

describe("continuous discovery job", () => {
  let userId: string;
  let workspaceId: string;
  let notReadyWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    // Forces the deterministic mock query-generation/extraction path
    // regardless of whether a real (possibly credit-exhausted)
    // ANTHROPIC_API_KEY is configured in this environment — this test
    // asserts the pipeline's wiring, not the real Claude integration
    // (see ai-extraction/live-anthropic.test.ts).
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    // Sweeps any BusinessBrain (and related) rows orphaned by earlier test
    // runs whose Workspace was deleted without a matching cleanup — see
    // src/lib/test-utils/cleanup-orphaned-records.ts. Runs before this
    // suite's own workspaces exist, so it can only ever touch pre-existing
    // debris, never anything created below.
    await cleanupOrphanedTestRecords();

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Discovery Job" });
    userId = user.id;

    const workspace = await seedReadyWorkspace(userId, "Discovery Job Co");
    workspaceId = workspace.id;

    const notReadyWorkspace = await createWorkspaceWithOwner("Discovery Job Not Ready Co", userId);
    notReadyWorkspaceId = notReadyWorkspace.id;
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await Workspace.deleteMany({ _id: { $in: [workspaceId, notReadyWorkspaceId] } });
    await User.deleteOne({ _id: userId });
    // This suite's own workspaces are now gone but their BusinessBrain (and
    // related) rows aren't cascade-deleted — sweep them immediately instead
    // of letting them join the pile for the next run to deal with.
    await cleanupOrphanedTestRecords();
  });

  it("skips a workspace with no Business Brain rather than throwing", async () => {
    const result = await runDiscoveryForWorkspace(notReadyWorkspaceId);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.created).toBe(0);
  });

  it("runs the full pipeline for a ready workspace: generates queries, discovers, scores, and logs usage", async () => {
    const result = await runDiscoveryForWorkspace(workspaceId);

    expect(result.skipped).toBe(false);
    expect(result.searchQueriesGenerated).toBeGreaterThan(0);
    expect(result.queriesRun).toBeGreaterThan(0);
    expect(result.created).toBeGreaterThan(0);
    expect(result.scored).toBe(result.created);

    const targets = await TargetCompany.find({ workspaceId });
    expect(targets.length).toBe(result.created);
    expect(targets.every((t) => t.priorityGrade !== null)).toBe(true);

    const usageLog = await UsageLog.findOne({ workspaceId, metric: "discovery_run" });
    expect(usageLog).not.toBeNull();
    expect(Number(usageLog?.quantity)).toBe(result.created);
  });

  it("a second run doesn't regenerate search queries (they already exist) but still discovers/scores", async () => {
    const result = await runDiscoveryForWorkspace(workspaceId);
    expect(result.searchQueriesGenerated).toBe(0);
    expect(result.skipped).toBe(false);
  });

  // This scans every ACTIVE/STALE BusinessBrain in the shared database, not
  // just this test's own workspace — historically that included ~140 rows
  // orphaned by earlier test runs (Mongoose has no cascade delete, so a
  // deleted Workspace's BusinessBrain stuck around). beforeAll now sweeps
  // that debris via cleanupOrphanedTestRecords() before this test runs, so a
  // modest timeout is enough again — kept above the default 5s since this
  // still does real (mock) work for every brain still in the shared DB from
  // whatever else is running concurrently in this test session.
  it(
    "runDiscoveryForAllWorkspaces processes only workspaces with an ACTIVE/STALE brain",
    async () => {
      const results = await runDiscoveryForAllWorkspaces();
      const forThisWorkspace = results.find((r) => r.workspaceId === workspaceId);
      expect(forThisWorkspace).toBeDefined();
      expect(results.some((r) => r.workspaceId === notReadyWorkspaceId)).toBe(false);
    },
    60_000,
  );
});
