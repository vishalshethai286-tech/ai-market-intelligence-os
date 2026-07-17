import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderBuyer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { listTenderBuyers, getTenderBuyer, updateTenderBuyerStatus, countTenderBuyersForRun, countTenderBuyers, TenderBuyerNotFoundError } = await import(
  "./buyer-service"
);

await dbConnect();

const TEST_PREFIX = "vitest-tenders-buyer-service-";

function baseBuyerFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

describe("tender buyer service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Buyer Service" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Buyer Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Buyer Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    await TenderBuyer.create([
      baseBuyerFields(workspaceId, { customerName: "Qatar Energy", country: "Qatar", status: "NEW", discoveryRunId: "run-a" }),
      baseBuyerFields(workspaceId, { customerName: "Beta Ministry", country: "India", status: "APPROVED", discoveryRunId: "run-b" }),
      baseBuyerFields(workspaceId, { customerName: "Gamma Council", country: "India", status: "REJECTED", duplicateStatus: "POSSIBLE_DUPLICATE", discoveryRunId: "run-b" }),
    ]);
    await TenderBuyer.create(baseBuyerFields(otherWorkspaceId, { customerName: "Other Workspace Buyer", country: "USA" }));
  });

  afterAll(async () => {
    await TenderBuyer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("lists all tender buyers for the workspace, excluding other workspaces", async () => {
    const result = await listTenderBuyers(workspaceId);
    expect(result.total).toBe(3);
    expect(result.buyers.every((b) => b.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by country", async () => {
    const result = await listTenderBuyers(workspaceId, { country: "India" });
    expect(result.total).toBe(2);
    expect(result.buyers.every((b) => b.country === "India")).toBe(true);
  });

  it("filters by status", async () => {
    const result = await listTenderBuyers(workspaceId, { status: "APPROVED" });
    expect(result.total).toBe(1);
    expect(result.buyers[0].customerName).toBe("Beta Ministry");
  });

  it("filters by duplicateStatus", async () => {
    const result = await listTenderBuyers(workspaceId, { duplicateStatus: "POSSIBLE_DUPLICATE" });
    expect(result.total).toBe(1);
    expect(result.buyers[0].customerName).toBe("Gamma Council");
  });

  it("searches by customer name (case-insensitive substring)", async () => {
    const result = await listTenderBuyers(workspaceId, { q: "qatar" });
    expect(result.total).toBe(1);
    expect(result.buyers[0].customerName).toBe("Qatar Energy");
  });

  it("paginates results", async () => {
    const result = await listTenderBuyers(workspaceId, { pageSize: 2, page: 1 });
    expect(result.buyers.length).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it("gets a single tender buyer by id, scoped to the workspace", async () => {
    const created = await TenderBuyer.create(baseBuyerFields(workspaceId, { customerName: "Delta Authority" }));
    const found = await getTenderBuyer(workspaceId, created.id);
    expect(found.customerName).toBe("Delta Authority");
  });

  it("throws TenderBuyerNotFoundError for an id from another workspace", async () => {
    const otherBuyer = await TenderBuyer.findOne({ workspaceId: otherWorkspaceId });
    await expect(getTenderBuyer(workspaceId, otherBuyer!.id)).rejects.toThrow(TenderBuyerNotFoundError);
  });

  it("updates a tender buyer's status", async () => {
    const created = await TenderBuyer.create(baseBuyerFields(workspaceId, { customerName: "Epsilon Board", status: "NEW" }));
    const updated = await updateTenderBuyerStatus(workspaceId, created.id, "WATCHING");
    expect(updated.status).toBe("WATCHING");

    const persisted = await TenderBuyer.findById(created.id);
    expect(persisted?.status).toBe("WATCHING");
  });

  it("counts tender buyers for a discovery run", async () => {
    const count = await countTenderBuyersForRun(workspaceId, "run-b");
    expect(count).toBe(2);
  });

  it("counts total tender buyers for a workspace, excluding other workspaces", async () => {
    const count = await countTenderBuyers(workspaceId);
    const otherCount = await countTenderBuyers(otherWorkspaceId);
    expect(count).toBeGreaterThanOrEqual(3);
    expect(otherCount).toBe(1);
  });
});
