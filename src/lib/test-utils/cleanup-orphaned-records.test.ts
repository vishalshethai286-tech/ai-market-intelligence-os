import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, BusinessBrain, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { cleanupOrphanedTestRecords, isTestDbCleanupAllowed, TestDbCleanupNotAllowedError } = await import(
  "./cleanup-orphaned-records"
);

await dbConnect();

const TEST_PREFIX = "vitest-cleanup-orphaned-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function makeWorkspaceWithBrain(name: string) {
  const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}-${Math.random()}@example.com`, name });
  const workspace = await createWorkspaceWithOwner(name, user.id);
  const brain = await BusinessBrain.create({ workspaceId: workspace.id, status: "ACTIVE" });
  return { userId: user.id, workspaceId: workspace.id, brainId: brain.id };
}

describe("isTestDbCleanupAllowed", () => {
  it("is true under Vitest's ambient NODE_ENV=test", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(isTestDbCleanupAllowed()).toBe(true);
  });

  it("is true when ALLOW_TEST_DB_CLEANUP=true, even outside NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_TEST_DB_CLEANUP", "true");
    expect(isTestDbCleanupAllowed()).toBe(true);
  });

  it("is false outside NODE_ENV=test without the explicit opt-in", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_TEST_DB_CLEANUP", "");
    expect(isTestDbCleanupAllowed()).toBe(false);
  });
});

describe("cleanupOrphanedTestRecords", () => {
  it("refuses to run when not in test mode and ALLOW_TEST_DB_CLEANUP is not true", async () => {
    const { userId, workspaceId, brainId } = await makeWorkspaceWithBrain("Cleanup Guard Co");
    await Workspace.deleteOne({ _id: workspaceId }); // orphan the brain

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_TEST_DB_CLEANUP", "");

    await expect(cleanupOrphanedTestRecords()).rejects.toThrow(TestDbCleanupNotAllowedError);

    vi.unstubAllEnvs();
    // Nothing was deleted — the guard refused before touching the database.
    expect(await BusinessBrain.findById(brainId)).not.toBeNull();
    await BusinessBrain.deleteOne({ _id: brainId });
    await User.deleteOne({ _id: userId });
  });

  it("deletes orphaned BusinessBrain records (and related debris) in test mode", async () => {
    const { userId, workspaceId, brainId } = await makeWorkspaceWithBrain("Cleanup Orphan Co");
    await TargetCustomer.create({
      workspaceId,
      customerName: "Orphaned Customer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await Workspace.deleteOne({ _id: workspaceId }); // simulate the real bug: workspace deleted, brain/related rows left behind

    const summary = await cleanupOrphanedTestRecords();

    expect(summary.guardUsed).toBe("NODE_ENV=test");
    expect(summary.businessBrainFound).toBeGreaterThanOrEqual(1);
    expect(summary.businessBrainDeleted).toBe(summary.businessBrainFound);
    expect(summary.businessBrainSkipped).toBe(0);
    expect(summary.relatedDeleted.TargetCustomer).toBeGreaterThanOrEqual(1);

    expect(await BusinessBrain.findById(brainId)).toBeNull();
    expect(await TargetCustomer.countDocuments({ workspaceId })).toBe(0);
    await User.deleteOne({ _id: userId });
  });

  it("does not delete BusinessBrain records with a valid Workspace", async () => {
    const { userId, workspaceId, brainId } = await makeWorkspaceWithBrain("Cleanup Valid Co");

    await cleanupOrphanedTestRecords();

    expect(await BusinessBrain.findById(brainId)).not.toBeNull();

    await BusinessBrain.deleteOne({ _id: brainId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("does not cross workspace boundaries — cleaning up one orphan never touches another workspace's valid records", async () => {
    const orphaned = await makeWorkspaceWithBrain("Cleanup Boundary Orphan Co");
    await Workspace.deleteOne({ _id: orphaned.workspaceId });

    const valid = await makeWorkspaceWithBrain("Cleanup Boundary Valid Co");

    await cleanupOrphanedTestRecords();

    expect(await BusinessBrain.findById(orphaned.brainId)).toBeNull();
    expect(await BusinessBrain.findById(valid.brainId)).not.toBeNull();

    await BusinessBrain.deleteOne({ _id: valid.brainId });
    await Workspace.deleteOne({ _id: valid.workspaceId });
    await User.deleteOne({ _id: orphaned.userId });
    await User.deleteOne({ _id: valid.userId });
  });
});
