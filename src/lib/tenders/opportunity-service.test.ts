import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  listTenderOpportunities,
  getTenderOpportunity,
  updateTenderOpportunityStatus,
  countTenderOpportunitiesForRun,
  getTenderDashboardStats,
  TenderOpportunityNotFoundError,
} = await import("./opportunity-service");

await dbConnect();

const TEST_PREFIX = "vitest-tenders-opportunity-service-";

function baseOpportunityFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    buyerOrganization: "Public Works Department",
    tenderTitle: "Base Tender",
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    status: "NEW",
    duplicateStatus: "UNIQUE",
    priority: "B",
    priorityScore: 60,
    ...overrides,
  };
}

describe("tender opportunity service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Opportunity Service" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Opportunity Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Opportunity Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    await TenderOpportunity.create([
      baseOpportunityFields(workspaceId, {
        tenderTitle: "Stainless Steel Pipes Supply",
        country: "USA",
        priority: "A_PLUS",
        priorityScore: 90,
        endDate: futureDate,
        discoveryRunId: "run-a",
      }),
      baseOpportunityFields(workspaceId, {
        tenderTitle: "Road Resurfacing Program",
        country: "India",
        priority: "B",
        priorityScore: 55,
        endDate: pastDate,
        status: "EXPIRED",
        discoveryRunId: "run-b",
      }),
      baseOpportunityFields(workspaceId, {
        tenderTitle: "Water Treatment Plant Upgrade",
        country: "India",
        priority: "C",
        priorityScore: 30,
        endDate: soonDate,
        discoveryRunId: "run-b",
      }),
    ]);
    await TenderOpportunity.create(baseOpportunityFields(otherWorkspaceId, { tenderTitle: "Other Workspace Tender", country: "Canada" }));
  });

  afterAll(async () => {
    await TenderOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("lists all tender opportunities for the workspace, excluding other workspaces", async () => {
    const result = await listTenderOpportunities(workspaceId);
    expect(result.total).toBe(3);
    expect(result.opportunities.every((o) => o.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by country", async () => {
    const result = await listTenderOpportunities(workspaceId, { country: "India" });
    expect(result.total).toBe(2);
  });

  it("filters by priority", async () => {
    const result = await listTenderOpportunities(workspaceId, { priority: "A_PLUS" });
    expect(result.total).toBe(1);
    expect(result.opportunities[0].tenderTitle).toBe("Stainless Steel Pipes Supply");
  });

  it("filters by status", async () => {
    const result = await listTenderOpportunities(workspaceId, { status: "EXPIRED" });
    expect(result.total).toBe(1);
    expect(result.opportunities[0].tenderTitle).toBe("Road Resurfacing Program");
  });

  it("filters by activeState=ACTIVE (future or unknown endDate)", async () => {
    const result = await listTenderOpportunities(workspaceId, { activeState: "ACTIVE" });
    expect(result.total).toBe(2);
    expect(result.opportunities.some((o) => o.tenderTitle === "Road Resurfacing Program")).toBe(false);
  });

  it("filters by activeState=EXPIRED (past endDate)", async () => {
    const result = await listTenderOpportunities(workspaceId, { activeState: "EXPIRED" });
    expect(result.total).toBe(1);
    expect(result.opportunities[0].tenderTitle).toBe("Road Resurfacing Program");
  });

  it("searches by tender title (case-insensitive substring)", async () => {
    const result = await listTenderOpportunities(workspaceId, { q: "pipes" });
    expect(result.total).toBe(1);
    expect(result.opportunities[0].tenderTitle).toBe("Stainless Steel Pipes Supply");
  });

  it("sorts by priorityScore descending", async () => {
    const result = await listTenderOpportunities(workspaceId, { sortBy: "priorityScore", sortDir: "desc" });
    expect(result.opportunities[0].priorityScore).toBe(90);
  });

  it("sorts by endDate ascending", async () => {
    const result = await listTenderOpportunities(workspaceId, { sortBy: "endDate", sortDir: "asc" });
    expect(result.opportunities[0].tenderTitle).toBe("Road Resurfacing Program");
  });

  it("paginates results", async () => {
    const result = await listTenderOpportunities(workspaceId, { pageSize: 2, page: 1 });
    expect(result.opportunities.length).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it("gets a single tender opportunity by id, scoped to the workspace", async () => {
    const created = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { tenderTitle: "Delta Tender" }));
    const found = await getTenderOpportunity(workspaceId, created.id);
    expect(found.tenderTitle).toBe("Delta Tender");
  });

  it("throws TenderOpportunityNotFoundError for an id from another workspace", async () => {
    const otherOpportunity = await TenderOpportunity.findOne({ workspaceId: otherWorkspaceId });
    await expect(getTenderOpportunity(workspaceId, otherOpportunity!.id)).rejects.toThrow(TenderOpportunityNotFoundError);
  });

  it("updates a tender opportunity's status", async () => {
    const created = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { tenderTitle: "Epsilon Tender" }));
    const updated = await updateTenderOpportunityStatus(workspaceId, created.id, "ELIGIBLE");
    expect(updated.status).toBe("ELIGIBLE");

    const persisted = await TenderOpportunity.findById(created.id);
    expect(persisted?.status).toBe("ELIGIBLE");
  });

  it("counts tender opportunities for a discovery run", async () => {
    const count = await countTenderOpportunitiesForRun(workspaceId, "run-b");
    expect(count).toBe(2);
  });

  it("computes dashboard stats (totals, active/expired, A+ count, priority/country breakdowns, expiring soon)", async () => {
    const stats = await getTenderDashboardStats(workspaceId, 7);
    expect(stats.totalBuyers).toBe(7);
    expect(stats.totalOpportunities).toBeGreaterThanOrEqual(3);
    expect(stats.aPlusCount).toBeGreaterThanOrEqual(1);
    expect(stats.active).toBeGreaterThanOrEqual(1);
    expect(stats.expired).toBeGreaterThanOrEqual(1);
    expect(stats.byPriority.A_PLUS).toBeGreaterThanOrEqual(1);
    expect(stats.byCountry.some((c) => c.country === "India")).toBe(true);
    expect(stats.expiringSoon.some((o) => o.tenderTitle === "Water Treatment Plant Upgrade")).toBe(true);
  });
});
