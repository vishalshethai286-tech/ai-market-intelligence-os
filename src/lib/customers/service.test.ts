import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { listCustomers, getCustomer, updateCustomerStatus, CustomerNotFoundError } = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-customers-service-";

describe("customers/service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Service" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const baseFields = {
      workspaceId,
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    };
    await TargetCustomer.create([
      { ...baseFields, customerName: "Alpha Pumps", country: "USA", score: 90, priority: "A_PLUS", status: "NEW" },
      { ...baseFields, customerName: "Beta Valves", country: "India", score: 60, priority: "B", status: "APPROVED" },
      { ...baseFields, customerName: "Gamma Seals", country: "USA", score: 30, priority: "C", status: "REJECTED" },
      { ...baseFields, workspaceId: otherWorkspaceId, customerName: "Other Co Customer", country: "USA", score: 90, priority: "A_PLUS", status: "NEW" },
    ]);
  });

  afterAll(async () => {
    await TargetCustomer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("lists only the requesting workspace's customers", async () => {
    const { customers, total } = await listCustomers(workspaceId);
    expect(total).toBe(3);
    expect(customers.every((c) => c.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by country, priority, and status", async () => {
    expect((await listCustomers(workspaceId, { country: "India" })).total).toBe(1);
    expect((await listCustomers(workspaceId, { priority: "A_PLUS" })).total).toBe(1);
    expect((await listCustomers(workspaceId, { status: "APPROVED" })).total).toBe(1);
  });

  it("searches by customer name", async () => {
    const { customers } = await listCustomers(workspaceId, { q: "Beta" });
    expect(customers).toHaveLength(1);
    expect(customers[0].customerName).toBe("Beta Valves");
  });

  it("sorts by score descending by default when sortBy=score", async () => {
    const { customers } = await listCustomers(workspaceId, { sortBy: "score", sortDir: "desc" });
    expect(customers.map((c) => c.score)).toEqual([90, 60, 30]);
  });

  it("paginates results", async () => {
    const page1 = await listCustomers(workspaceId, { pageSize: 2, page: 1 });
    const page2 = await listCustomers(workspaceId, { pageSize: 2, page: 2 });
    expect(page1.customers).toHaveLength(2);
    expect(page2.customers).toHaveLength(1);
    expect(page1.totalPages).toBe(2);
  });

  it("getCustomer throws CustomerNotFoundError for another workspace's customer", async () => {
    const other = await TargetCustomer.findOne({ workspaceId: otherWorkspaceId });
    await expect(getCustomer(workspaceId, other!.id)).rejects.toThrow(CustomerNotFoundError);
  });

  it("updateCustomerStatus updates status and is ownership-checked", async () => {
    const mine = await TargetCustomer.findOne({ workspaceId, customerName: "Alpha Pumps" });
    const updated = await updateCustomerStatus(workspaceId, mine!.id, "CONTACTED");
    expect(updated.status).toBe("CONTACTED");

    const other = await TargetCustomer.findOne({ workspaceId: otherWorkspaceId });
    await expect(updateCustomerStatus(workspaceId, other!.id, "CONTACTED")).rejects.toThrow(CustomerNotFoundError);
  });
});
