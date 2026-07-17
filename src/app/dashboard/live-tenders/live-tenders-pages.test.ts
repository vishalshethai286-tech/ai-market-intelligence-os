import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderOpportunity } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const LiveTendersPage = (await import("./page")).default;
const LiveTenderDetailPage = (await import("./[id]/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-live-tenders-pages-";

describe("Live Tenders pages render", () => {
  let userId: string;
  let workspaceId: string;
  let opportunityId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Live Tender Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await TenderOpportunity.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Live Tenders page renders the empty state with no tenders yet", async () => {
    const element = (await LiveTendersPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Live Tenders page renders with data, filters, and sort applied", async () => {
    const opportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Filter Test Authority",
      tenderTitle: "Filter Test Tender",
      country: "USA",
      priority: "A",
      priorityScore: 75,
      status: "NEW",
      duplicateStatus: "UNIQUE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    opportunityId = opportunity.id;

    const element = (await LiveTendersPage({
      searchParams: Promise.resolve({
        country: "USA",
        priority: "A",
        status: "NEW",
        activeState: "ACTIVE",
        sortBy: "priorityScore",
        sortDir: "desc",
      }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Live Tender detail page renders for an existing opportunity", async () => {
    const element = (await LiveTenderDetailPage({ params: Promise.resolve({ id: opportunityId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
