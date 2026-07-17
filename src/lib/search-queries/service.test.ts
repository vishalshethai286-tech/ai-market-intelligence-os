import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QUERY_CATEGORIES } from "./constants";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const {
  generateAndStoreSearchQueries,
  listSearchQueries,
  BrainNotReadyError,
  InsufficientBrainContextError,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-search-queries-";

describe("search-queries service", () => {
  let userId: string;
  let readyWorkspaceId: string;
  let noBrainWorkspaceId: string;
  let sparseBrainWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    // Forces the deterministic mock query generator regardless of whether a
    // real (possibly credit-exhausted) ANTHROPIC_API_KEY is configured in
    // this environment — this test asserts mock-generator behavior
    // specifically, not the real Claude integration (see live-anthropic.test.ts).
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Search Queries" });
    userId = user.id;

    const readyWorkspace = await createWorkspaceWithOwner("Search Queries Ready Co", userId);
    readyWorkspaceId = readyWorkspace.id;
    await CompanyProfile.create({
      workspaceId: readyWorkspaceId,
      companyName: "Acme Pumps",
      industry: "Manufacturing",
      countriesServed: ["United States"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId: readyWorkspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["OEM"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(readyWorkspaceId);

    const noBrainWorkspace = await createWorkspaceWithOwner("Search Queries No Brain Co", userId);
    noBrainWorkspaceId = noBrainWorkspace.id;

    const sparseBrainWorkspace = await createWorkspaceWithOwner("Search Queries Sparse Co", userId);
    sparseBrainWorkspaceId = sparseBrainWorkspace.id;
    await buildInitialBrain(sparseBrainWorkspaceId); // no CompanyProfile/ProductService — sparse facts
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await Workspace.deleteMany({ _id: { $in: [readyWorkspaceId, noBrainWorkspaceId, sparseBrainWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("throws BrainNotReadyError when the workspace has no Business Brain yet", async () => {
    await expect(generateAndStoreSearchQueries(noBrainWorkspaceId)).rejects.toThrow(BrainNotReadyError);
  });

  it("throws InsufficientBrainContextError when the brain has nothing to ground a query in", async () => {
    await expect(generateAndStoreSearchQueries(sparseBrainWorkspaceId)).rejects.toThrow(
      InsufficientBrainContextError,
    );
  });

  it("generates and stores queries across categories, grounded in the Business Brain", async () => {
    const result = await generateAndStoreSearchQueries(readyWorkspaceId);
    expect(result.created).toBeGreaterThan(0);
    expect(result.queries.length).toBe(result.created);

    const categoriesFound = new Set(result.queries.map((q) => q.category));
    expect(categoriesFound.size).toBeGreaterThan(1);
    for (const query of result.queries) {
      expect(QUERY_CATEGORIES.some((c) => c.category === query.category)).toBe(true);
      expect(query.query.length).toBeGreaterThan(0);
    }
  });

  it("dedupes exact-string repeats on a second run instead of erroring or duplicating", async () => {
    const before = await listSearchQueries(readyWorkspaceId);
    const second = await generateAndStoreSearchQueries(readyWorkspaceId);
    // The mock generator is deterministic given the same Brain facts, so every
    // query on the second run is an exact repeat — skipDuplicates means 0 new rows.
    expect(second.created).toBe(0);
    const after = await listSearchQueries(readyWorkspaceId);
    expect(after.length).toBe(before.length);
  });
});
