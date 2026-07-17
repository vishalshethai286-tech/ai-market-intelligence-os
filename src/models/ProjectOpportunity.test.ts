import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ProjectOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-project-opportunity-model-";

describe("ProjectOpportunity model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await ProjectOpportunity.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId, clientName, projectName, rawSearchResultId, and discoveryRunId", async () => {
    await expect(ProjectOpportunity.create({})).rejects.toThrow();
    await expect(
      ProjectOpportunity.create({ workspaceId, clientName: "Acme", projectName: "New Plant" }),
    ).rejects.toThrow(); // still missing rawSearchResultId/discoveryRunId
  });

  it("defaults status=NEW, duplicateStatus=UNIQUE, projectStage=UNKNOWN, score=0", async () => {
    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Acme Industries",
      projectName: "New Refinery",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
    });
    expect(project.status).toBe("NEW");
    expect(project.duplicateStatus).toBe("UNIQUE");
    expect(project.projectStage).toBe("UNKNOWN");
    expect(project.score).toBe(0);
    expect(project.sourceHistory).toEqual([]);
  });

  it("rejects an invalid projectStage/status/priority/duplicateStatus enum value", async () => {
    await expect(
      ProjectOpportunity.create({
        workspaceId,
        clientName: "Acme",
        projectName: "Bad Stage Project",
        rawSearchResultId: "raw-2",
        discoveryRunId: "run-2",
        projectStage: "NOT_A_REAL_STAGE",
      }),
    ).rejects.toThrow();

    await expect(
      ProjectOpportunity.create({
        workspaceId,
        clientName: "Acme",
        projectName: "Bad Status Project",
        rawSearchResultId: "raw-3",
        discoveryRunId: "run-3",
        status: "NOT_A_REAL_STATUS",
      }),
    ).rejects.toThrow();

    await expect(
      ProjectOpportunity.create({
        workspaceId,
        clientName: "Acme",
        projectName: "Bad Priority Project",
        rawSearchResultId: "raw-4",
        discoveryRunId: "run-4",
        priority: "Z",
      }),
    ).rejects.toThrow();
  });

  it("accepts every documented projectStage/status/priority/duplicateStatus value", async () => {
    const stages = ["ANNOUNCED", "PLANNING", "FEED", "TENDER", "AWARDED", "CONSTRUCTION", "OPERATIONAL", "UNKNOWN"];
    const statuses = ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"];
    const priorities = ["A_PLUS", "A", "B", "C"];
    const duplicateStatuses = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"];

    for (const projectStage of stages) {
      await expect(
        ProjectOpportunity.create({
          workspaceId,
          clientName: "Acme",
          projectName: `Stage ${projectStage}`,
          rawSearchResultId: "raw",
          discoveryRunId: "run",
          projectStage,
        }),
      ).resolves.toBeTruthy();
    }
    for (const status of statuses) {
      await expect(
        ProjectOpportunity.create({
          workspaceId,
          clientName: "Acme",
          projectName: `Status ${status}`,
          rawSearchResultId: "raw",
          discoveryRunId: "run",
          status,
        }),
      ).resolves.toBeTruthy();
    }
    for (const priority of priorities) {
      await expect(
        ProjectOpportunity.create({
          workspaceId,
          clientName: "Acme",
          projectName: `Priority ${priority}`,
          rawSearchResultId: "raw",
          discoveryRunId: "run",
          priority,
        }),
      ).resolves.toBeTruthy();
    }
    for (const duplicateStatus of duplicateStatuses) {
      await expect(
        ProjectOpportunity.create({
          workspaceId,
          clientName: "Acme",
          projectName: `Duplicate ${duplicateStatus}`,
          rawSearchResultId: "raw",
          discoveryRunId: "run",
          duplicateStatus,
        }),
      ).resolves.toBeTruthy();
    }
  });
});
