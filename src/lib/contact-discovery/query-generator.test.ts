import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, ContactDiscoveryTarget, SearchQuery, SearchQueueItem } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { buildContactQueriesForTarget, generateContactSearchQueue, BrainNotReadyError } = await import("./query-generator");

await dbConnect();

const TEST_PREFIX = "vitest-contact-discovery-query-generator-";

describe("buildContactQueriesForTarget", () => {
  it("never generates a LinkedIn-targeted or login-bypassing query", () => {
    const queries = buildContactQueriesForTarget("ADNOC", "adnoc.example.com");
    for (const query of queries) {
      expect(query.toLowerCase()).not.toContain("linkedin");
      expect(query.toLowerCase()).not.toContain("login");
      expect(query.toLowerCase()).not.toContain("password");
    }
  });

  it("includes the full set of company-name templates (procurement/vendor/project/tender)", () => {
    const queries = buildContactQueriesForTarget("ADNOC", null);
    expect(queries).toContain("ADNOC procurement contact");
    expect(queries).toContain("ADNOC supplier registration contact");
    expect(queries).toContain("ADNOC project manager");
    expect(queries).toContain("ADNOC tender contact");
    expect(queries.length).toBe(22);
  });

  it("adds site:domain queries only when a domain is known", () => {
    const withDomain = buildContactQueriesForTarget("ADNOC", "adnoc.example.com");
    const withoutDomain = buildContactQueriesForTarget("ADNOC", null);
    expect(withDomain.length).toBe(30);
    expect(withoutDomain.length).toBe(22);
    expect(withDomain).toContain("site:adnoc.example.com procurement");
    expect(withDomain).toContain("site:adnoc.example.com PDF procurement contact");
  });
});

describe("generateContactSearchQueue", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Query Generator Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Query Generator Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      ContactDiscoveryTarget.deleteMany({ workspaceId }),
      SearchQuery.deleteMany({ workspaceId }),
      SearchQueueItem.deleteMany({ workspaceId }),
      ProductService.deleteMany({ workspaceId }),
      CompanyProfile.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("throws BrainNotReadyError when no Business Brain has been built yet", async () => {
    await expect(generateContactSearchQueue(workspaceId)).rejects.toThrow(BrainNotReadyError);
  });

  it("generates CONTACT-searchType queries for every un-queued target, and marks them QUEUED", async () => {
    await CompanyProfile.create({
      workspaceId,
      companyName: "Contact Query Generator Co",
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

    const target = await ContactDiscoveryTarget.create({
      workspaceId,
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: "customer-qg-1",
      companyName: "ADNOC Query Gen",
      companyWebsite: "https://adnoc-qg.example.com",
      companyDomain: "adnoc-qg.example.com",
      country: "United Arab Emirates",
      priority: "A_PLUS",
    });

    const summary = await generateContactSearchQueue(workspaceId);
    expect(summary.queriesCreated).toBe(30);
    expect(summary.queueItemsCreated).toBe(30);

    const queries = await SearchQuery.find({ workspaceId, relatedRecordId: "customer-qg-1" });
    expect(queries.length).toBe(30);
    for (const query of queries) {
      expect(query.searchType).toBe("CONTACT");
      expect(query.relatedRecordType).toBe("TARGET_CUSTOMER");
      expect(query.relatedCompanyName).toBe("ADNOC Query Gen");
      expect(query.query.toLowerCase()).not.toContain("linkedin");
    }

    const queueItems = await SearchQueueItem.find({ workspaceId, searchQueryId: { $in: queries.map((q) => q.id) } });
    expect(queueItems.length).toBe(30);

    const updatedTarget = await ContactDiscoveryTarget.findById(target.id);
    expect(updatedTarget?.status).toBe("QUEUED");
    expect(updatedTarget?.lastQueuedAt).toBeTruthy();
  });

  it("does not duplicate query text already present for the workspace on a second run", async () => {
    const before = await SearchQuery.countDocuments({ workspaceId });
    const summary = await generateContactSearchQueue(workspaceId);
    expect(summary.queriesCreated).toBe(0);
    expect(summary.duplicatesSkipped).toBeGreaterThan(0);
    const after = await SearchQuery.countDocuments({ workspaceId });
    expect(after).toBe(before);
  });
});
