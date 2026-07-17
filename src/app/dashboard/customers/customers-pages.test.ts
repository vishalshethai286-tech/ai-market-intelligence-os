import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, DiscoveryRun } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const CustomersPage = (await import("./page")).default;
const CustomerDetailPage = (await import("./[id]/page")).default;
const DiscoveryRunDetailPage = (await import("@/app/dashboard/discovery-runs/[id]/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-customers-pages-";

describe("Customers pages render", () => {
  let userId: string;
  let workspaceId: string;
  let customerId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await TargetCustomer.deleteMany({ workspaceId });
    await DiscoveryRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Customers page renders the empty state with no customers yet", async () => {
    const element = (await CustomersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Customers page renders with data and filters applied", async () => {
    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "Filter Test Co",
      country: "USA",
      score: 72,
      priority: "A",
      status: "NEW",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    customerId = customer.id;

    const element = (await CustomersPage({
      searchParams: Promise.resolve({ country: "USA", priority: "A", status: "NEW", sortBy: "score" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Customer detail page renders for an existing customer", async () => {
    const element = (await CustomerDetailPage({ params: Promise.resolve({ id: customerId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Discovery Run detail page renders with the Process Customer Results button available", async () => {
    const run = await DiscoveryRun.create({
      workspaceId,
      discoveryBrainId: "brain-1",
      runType: "MANUAL",
      status: "COMPLETED",
      searchType: "CUSTOMER",
      queriesExecuted: 1,
      rawResultsFound: 1,
    });

    const element = (await DiscoveryRunDetailPage({ params: Promise.resolve({ id: run.id }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
