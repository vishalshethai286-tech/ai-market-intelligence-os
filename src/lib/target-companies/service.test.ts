import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, TargetCompany } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { generateAndStoreSearchQueries } = await import("@/lib/search-queries/service");
const {
  discoverAndExtractTargetCompanies,
  listTargetCompanies,
  approveTargetCompany,
  rejectTargetCompany,
  deleteTargetCompany,
  TargetCompanyNotFoundError,
  NoSearchQueriesError,
  BrainNotReadyError,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-target-companies-";

describe("target-companies service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let noQueriesWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    // Forces the deterministic mock query-generation/extraction path
    // regardless of whether a real (possibly credit-exhausted)
    // ANTHROPIC_API_KEY is configured in this environment — this test
    // asserts discoverAndExtractTargetCompanies's own wiring, not the real
    // Claude integration (see ai-extraction/live-anthropic.test.ts).
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Target Companies" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Target Companies Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Acme Pumps",
      industry: "Manufacturing",
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
    await generateAndStoreSearchQueries(workspaceId);

    const otherWorkspace = await createWorkspaceWithOwner("Target Companies Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const noQueriesWorkspace = await createWorkspaceWithOwner("Target Companies No Queries Co", userId);
    noQueriesWorkspaceId = noQueriesWorkspace.id;
    await buildInitialBrain(noQueriesWorkspaceId);
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId, noQueriesWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("throws BrainNotReadyError with no Business Brain", async () => {
    const noBrainWorkspace = await createWorkspaceWithOwner("Target Companies No Brain Co", userId);
    try {
      await expect(discoverAndExtractTargetCompanies(noBrainWorkspace.id)).rejects.toThrow(BrainNotReadyError);
    } finally {
      await Workspace.deleteOne({ _id: noBrainWorkspace.id });
    }
  });

  it("throws NoSearchQueriesError when no SearchQuery rows exist yet", async () => {
    await expect(discoverAndExtractTargetCompanies(noQueriesWorkspaceId)).rejects.toThrow(NoSearchQueriesError);
  });

  it("discovers and stores target companies using the mock search + mock AI extraction path", async () => {
    const result = await discoverAndExtractTargetCompanies(workspaceId, { maxQueries: 3 });
    expect(result.queriesRun).toBeGreaterThan(0);
    expect(result.evaluated).toBeGreaterThan(0);
    expect(result.created).toBeGreaterThan(0);

    const targets = await listTargetCompanies(workspaceId);
    expect(targets.length).toBe(result.created);
    for (const target of targets) {
      expect(target.status).toBe("PENDING_REVIEW");
      expect(target.companyName.length).toBeGreaterThan(0);
    }
  });

  it("flags a repeat company as DUPLICATE on a second discovery run instead of dropping it", async () => {
    const before = await listTargetCompanies(workspaceId);
    await discoverAndExtractTargetCompanies(workspaceId, { maxQueries: 3 });
    const after = await listTargetCompanies(workspaceId);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((t) => t.duplicateStatus === "DUPLICATE")).toBe(true);
  });

  it("approveTargetCompany / rejectTargetCompany transition status correctly", async () => {
    const [target] = await listTargetCompanies(workspaceId);
    const approved = await approveTargetCompany(workspaceId, target.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.lastVerifiedAt).not.toBeNull();

    const rejected = await rejectTargetCompany(workspaceId, target.id);
    expect(rejected.status).toBe("REJECTED");
  });

  it("rejects mutating a target company that belongs to a different workspace", async () => {
    const [target] = await listTargetCompanies(workspaceId);
    await expect(approveTargetCompany(otherWorkspaceId, target.id)).rejects.toThrow(TargetCompanyNotFoundError);
    await expect(rejectTargetCompany(otherWorkspaceId, target.id)).rejects.toThrow(TargetCompanyNotFoundError);
    await expect(deleteTargetCompany(otherWorkspaceId, target.id)).rejects.toThrow(TargetCompanyNotFoundError);
  });

  it("deleteTargetCompany removes the row", async () => {
    const [target] = await listTargetCompanies(workspaceId);
    await deleteTargetCompany(workspaceId, target.id);
    const stillThere = await TargetCompany.findById(target.id);
    expect(stillThere).toBeNull();
  });
});
