import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ProjectOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { listProjects, getProject, updateProjectStatus, ProjectNotFoundError } = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-projects-service-";

describe("projects/service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Service" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Project Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Project Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const baseFields = {
      workspaceId,
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    };
    await ProjectOpportunity.create([
      { ...baseFields, clientName: "Alpha Co", projectName: "Alpha Plant", country: "USA", score: 90, priority: "A_PLUS", status: "NEW" },
      { ...baseFields, clientName: "Beta Co", projectName: "Beta Terminal", country: "India", score: 60, priority: "B", status: "APPROVED" },
      { ...baseFields, clientName: "Gamma Co", projectName: "Gamma Refinery", country: "USA", score: 30, priority: "C", status: "REJECTED" },
      { ...baseFields, workspaceId: otherWorkspaceId, clientName: "Other Co", projectName: "Other Project", country: "USA", score: 90, priority: "A_PLUS", status: "NEW" },
    ]);
  });

  afterAll(async () => {
    await ProjectOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("lists only the requesting workspace's projects", async () => {
    const { projects, total } = await listProjects(workspaceId);
    expect(total).toBe(3);
    expect(projects.every((p) => p.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by country, priority, and status", async () => {
    expect((await listProjects(workspaceId, { country: "India" })).total).toBe(1);
    expect((await listProjects(workspaceId, { priority: "A_PLUS" })).total).toBe(1);
    expect((await listProjects(workspaceId, { status: "APPROVED" })).total).toBe(1);
  });

  it("searches by client/project name", async () => {
    const { projects } = await listProjects(workspaceId, { q: "Beta" });
    expect(projects).toHaveLength(1);
    expect(projects[0].clientName).toBe("Beta Co");
  });

  it("sorts by score descending by default when sortBy=score", async () => {
    const { projects } = await listProjects(workspaceId, { sortBy: "score", sortDir: "desc" });
    expect(projects.map((p) => p.score)).toEqual([90, 60, 30]);
  });

  it("paginates results", async () => {
    const page1 = await listProjects(workspaceId, { pageSize: 2, page: 1 });
    const page2 = await listProjects(workspaceId, { pageSize: 2, page: 2 });
    expect(page1.projects).toHaveLength(2);
    expect(page2.projects).toHaveLength(1);
    expect(page1.totalPages).toBe(2);
  });

  it("getProject throws ProjectNotFoundError for another workspace's project", async () => {
    const other = await ProjectOpportunity.findOne({ workspaceId: otherWorkspaceId });
    await expect(getProject(workspaceId, other!.id)).rejects.toThrow(ProjectNotFoundError);
  });

  it("updateProjectStatus updates status and is ownership-checked", async () => {
    const mine = await ProjectOpportunity.findOne({ workspaceId, clientName: "Alpha Co" });
    const updated = await updateProjectStatus(workspaceId, mine!.id, "CONTACTED");
    expect(updated.status).toBe("CONTACTED");

    const other = await ProjectOpportunity.findOne({ workspaceId: otherWorkspaceId });
    await expect(updateProjectStatus(workspaceId, other!.id, "CONTACTED")).rejects.toThrow(ProjectNotFoundError);
  });
});
