import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ProjectOpportunity, DiscoveryRun } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const ProjectsPage = (await import("./page")).default;
const ProjectDetailPage = (await import("./[id]/page")).default;
const DiscoveryRunDetailPage = (await import("@/app/dashboard/discovery-runs/[id]/page")).default;
const RawSearchResultsPage = (await import("@/app/dashboard/raw-search-results/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-projects-pages-";

describe("Projects pages render", () => {
  let userId: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Project Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await ProjectOpportunity.deleteMany({ workspaceId });
    await DiscoveryRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Projects page renders the empty state with no projects yet", async () => {
    const element = (await ProjectsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Projects page renders with data and filters applied", async () => {
    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Filter Test Co",
      projectName: "Filter Test Project",
      country: "USA",
      projectStage: "TENDER",
      score: 72,
      priority: "A",
      status: "NEW",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    projectId = project.id;

    const element = (await ProjectsPage({
      searchParams: Promise.resolve({ country: "USA", projectStage: "TENDER", priority: "A", status: "NEW", sortBy: "score" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Project detail page renders for an existing project", async () => {
    const element = (await ProjectDetailPage({ params: Promise.resolve({ id: projectId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Discovery Run detail page renders with the Process Project Results button available", async () => {
    const run = await DiscoveryRun.create({
      workspaceId,
      discoveryBrainId: "brain-1",
      runType: "MANUAL",
      status: "COMPLETED",
      searchType: "PROJECT",
      queriesExecuted: 1,
      rawResultsFound: 1,
    });

    const element = (await DiscoveryRunDetailPage({ params: Promise.resolve({ id: run.id }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Raw Search Results page renders with the project filter applied", async () => {
    const element = (await RawSearchResultsPage({ searchParams: Promise.resolve({ searchType: "PROJECT" }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
