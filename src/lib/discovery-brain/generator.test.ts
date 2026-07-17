import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, SearchQuery } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { planDiscoveryQueries } = await import("./generator");
const { generateDiscoveryQueue } = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-generator-project-queries-";

describe("planDiscoveryQueries — project templates (Phase 9)", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Generator" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Generator Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Generator Co",
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
      buyerTypes: ["EPC Contractor"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);
  });

  afterAll(async () => {
    await Promise.all([SearchQuery.deleteMany({ workspaceId }), ProductService.deleteMany({ workspaceId }), CompanyProfile.deleteMany({ workspaceId })]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("generates project queries covering every required template pattern", async () => {
    const planned = await planDiscoveryQueries(workspaceId);
    const projectQueries = planned.filter((p) => p.searchType === "PROJECT").map((p) => p.query);

    expect(projectQueries.length).toBeGreaterThan(0);

    const expectedFragments = [
      "project announcement",
      "plant expansion",
      "EPC award",
      "EPC contractor awarded",
      "new factory",
      "construction project",
      "environmental approval",
      "funding announcement",
      "FEED contract",
      "new plant investment",
      "procurement project",
    ];
    for (const fragment of expectedFragments) {
      expect(projectQueries.some((q) => q.includes(fragment))).toBe(true);
    }
    // "[product/service] project [country]" template.
    expect(projectQueries.some((q) => q === "Centrifugal Pump project United States")).toBe(true);
  });

  it("does not generate duplicate project query strings within a single plan", async () => {
    const planned = await planDiscoveryQueries(workspaceId);
    const projectQueries = planned.filter((p) => p.searchType === "PROJECT").map((p) => p.query);
    expect(new Set(projectQueries).size).toBe(projectQueries.length);
  });

  it("generateDiscoveryQueue avoids re-creating duplicate SearchQuery rows on a second run", async () => {
    const first = await generateDiscoveryQueue(workspaceId);
    expect(first.queriesCreated).toBeGreaterThan(0);

    const countAfterFirst = await SearchQuery.countDocuments({ workspaceId });

    const second = await generateDiscoveryQueue(workspaceId);
    expect(second.queriesCreated).toBe(0);

    const countAfterSecond = await SearchQuery.countDocuments({ workspaceId });
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("generates vendor_registration queries covering every required template pattern (Phase 11)", async () => {
    const planned = await planDiscoveryQueries(workspaceId);
    const vendorRegistrationQueries = planned.filter((p) => p.searchType === "VENDOR_REGISTRATION").map((p) => p.query);

    expect(vendorRegistrationQueries.length).toBeGreaterThan(0);

    const expectedFragments = [
      "vendor registration",
      "supplier registration",
      "supplier portal",
      "become a supplier",
      "procurement supplier portal",
      "become a vendor",
      "procurement registration",
      "approved vendor registration",
    ];
    for (const fragment of expectedFragments) {
      expect(vendorRegistrationQueries.some((q) => q.includes(fragment))).toBe(true);
    }
    // "[product/service] supplier registration [country]" and "[product/service] vendor registration [country]" templates.
    expect(vendorRegistrationQueries.some((q) => q === "Centrifugal Pump supplier registration United States")).toBe(true);
    expect(vendorRegistrationQueries.some((q) => q === "Centrifugal Pump vendor registration United States")).toBe(true);
  });

  it("does not generate duplicate vendor_registration query strings within a single plan", async () => {
    const planned = await planDiscoveryQueries(workspaceId);
    const vendorRegistrationQueries = planned.filter((p) => p.searchType === "VENDOR_REGISTRATION").map((p) => p.query);
    expect(new Set(vendorRegistrationQueries).size).toBe(vendorRegistrationQueries.length);
  });
});
