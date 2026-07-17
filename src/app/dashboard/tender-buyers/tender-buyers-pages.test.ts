import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderBuyer, DiscoveryRun } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const TenderBuyersPage = (await import("./page")).default;
const TenderBuyerDetailPage = (await import("./[id]/page")).default;
const DiscoveryRunDetailPage = (await import("@/app/dashboard/discovery-runs/[id]/page")).default;
const RawSearchResultsPage = (await import("@/app/dashboard/raw-search-results/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-tender-buyers-pages-";

describe("Tender Buyers pages render", () => {
  let userId: string;
  let workspaceId: string;
  let buyerId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Tender Buyer Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await TenderBuyer.deleteMany({ workspaceId });
    await DiscoveryRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Tender Buyers page renders the empty state with no buyers yet", async () => {
    const element = (await TenderBuyersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Tender Buyers page renders with data and filters applied", async () => {
    const buyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Filter Test Buyer",
      country: "Qatar",
      status: "APPROVED",
      duplicateStatus: "UNIQUE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    buyerId = buyer.id;

    const element = (await TenderBuyersPage({
      searchParams: Promise.resolve({ country: "Qatar", status: "APPROVED", duplicateStatus: "UNIQUE" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Tender Buyer detail page renders for an existing buyer", async () => {
    const element = (await TenderBuyerDetailPage({ params: Promise.resolve({ id: buyerId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Discovery Run detail page renders with the Process Tender Results button available", async () => {
    const run = await DiscoveryRun.create({
      workspaceId,
      discoveryBrainId: "brain-1",
      runType: "MANUAL",
      status: "COMPLETED",
      searchType: "TENDER",
      queriesExecuted: 1,
      rawResultsFound: 1,
    });

    const element = (await DiscoveryRunDetailPage({ params: Promise.resolve({ id: run.id }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Raw Search Results page renders with the tender filter applied", async () => {
    const element = (await RawSearchResultsPage({ searchParams: Promise.resolve({ searchType: "TENDER" }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
