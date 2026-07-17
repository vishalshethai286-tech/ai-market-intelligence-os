import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { COUNTRIES } from "./countries";

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
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { generateDiscoveryQueue, getDiscoveryBrain, listDiscoveryQueue, listDiscoveryQueries, BrainNotReadyError } =
  await import("./service");
const { ensureCountryCoverageSeeded } = await import("./coverage");

await dbConnect();

const TEST_PREFIX = "vitest-discovery-brain-";

describe("country seed", () => {
  it("has no duplicate ISO codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has a 2-letter code, a name, and a region", () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.length).toBeGreaterThan(0);
      expect(country.region.length).toBeGreaterThan(0);
    }
  });

  it("covers a substantial global list, not just a curated handful", () => {
    expect(COUNTRIES.length).toBeGreaterThan(150);
  });
});

describe("coverage initialization", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}seed-${Date.now()}@example.com`, name: "Seed" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Coverage Seed Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await CountryCoverage.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("seeds one NOT_STARTED CountryCoverage row per global country", async () => {
    await ensureCountryCoverageSeeded(workspaceId);
    const rows = await CountryCoverage.find({ workspaceId });
    expect(rows.length).toBe(COUNTRIES.length);
    expect(rows.every((r) => r.status === "NOT_STARTED")).toBe(true);
  });

  it("is idempotent — seeding twice doesn't duplicate", async () => {
    await ensureCountryCoverageSeeded(workspaceId);
    const rows = await CountryCoverage.find({ workspaceId });
    expect(rows.length).toBe(COUNTRIES.length);
  });
});

describe("discovery-brain service", () => {
  let userId: string;
  let workspaceId: string;
  let noBrainWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Discovery Brain" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Discovery Brain Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Acme Pumps",
      industry: "Manufacturing",
      operationType: "MANUFACTURER",
      countriesServed: ["United States", "India"],
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

    const noBrainWorkspace = await createWorkspaceWithOwner("Discovery Brain No Brain Co", userId);
    noBrainWorkspaceId = noBrainWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      SearchQuery.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      SearchQueueItem.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      DiscoveryBrain.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      DiscoveryStrategy.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      CountryCoverage.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      IndustryCoverage.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      ProductCoverage.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
      CoverageSnapshot.deleteMany({ workspaceId: { $in: [workspaceId, noBrainWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, noBrainWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("throws BrainNotReadyError when the workspace has no Business Brain yet", async () => {
    await expect(generateDiscoveryQueue(noBrainWorkspaceId)).rejects.toThrow(BrainNotReadyError);
  });

  it("generates queries across all four search types, queues each one, and dedupes on a second run", async () => {
    const result = await generateDiscoveryQueue(workspaceId);
    expect(result.queriesCreated).toBeGreaterThan(0);
    expect(result.queueItemsCreated).toBe(result.queriesCreated);

    const queries = await listDiscoveryQueries(workspaceId);
    const searchTypes = new Set(queries.map((q) => q.searchType));
    expect(searchTypes.has("CUSTOMER")).toBe(true);
    expect(searchTypes.has("PROJECT")).toBe(true);
    expect(searchTypes.has("TENDER")).toBe(true);
    expect(searchTypes.has("VENDOR_REGISTRATION")).toBe(true);

    // Spot-check a couple of the exact requested template patterns.
    expect(queries.some((q) => q.query === "Centrifugal Pump companies United States")).toBe(true);
    expect(queries.some((q) => q.query === "Oil & Gas project announcement United States")).toBe(true);
    expect(queries.some((q) => q.query === "Centrifugal Pump tender United States")).toBe(true);
    expect(queries.some((q) => q.query === "Oil & Gas vendor registration United States")).toBe(true);

    const queue = await listDiscoveryQueue(workspaceId);
    expect(queue.length).toBe(queries.length);
    expect(queue.every((item) => item.status === "QUEUED")).toBe(true);

    const brain = await getDiscoveryBrain(workspaceId);
    expect(brain?.totalSearchQueries).toBe(queries.length);
    expect(brain?.totalQueueItems).toBe(queue.length);

    // Second run: same Brain state, so every candidate query already exists — nothing new queued.
    const second = await generateDiscoveryQueue(workspaceId);
    expect(second.queriesCreated).toBe(0);
    expect(second.queueItemsCreated).toBe(0);
    const queriesAfter = await listDiscoveryQueries(workspaceId);
    expect(queriesAfter.length).toBe(queries.length);
  });

  it("initializes country/industry/product coverage from the generated queue", async () => {
    const [country, industry, product] = await Promise.all([
      CountryCoverage.findOne({ workspaceId, countryName: "United States" }),
      IndustryCoverage.findOne({ workspaceId, industry: "Oil & Gas" }),
      ProductCoverage.findOne({ workspaceId }),
    ]);
    expect(country?.status).toBe("QUEUED");
    expect(country?.queriesTotal).toBeGreaterThan(0);
    expect(industry?.status).toBe("QUEUED");
    expect(product?.status).toBe("QUEUED");
  });

  it("records a CoverageSnapshot with the workspace's search-type breakdown", async () => {
    const snapshot = await CoverageSnapshot.findOne({ workspaceId }).sort({ capturedAt: -1 });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.bySearchType.CUSTOMER?.total).toBeGreaterThan(0);
  });
});
