import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderBuyer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-tender-buyer-model-";

describe("TenderBuyer model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await TenderBuyer.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId, customerName, rawSearchResultId, and discoveryRunId", async () => {
    await expect(TenderBuyer.create({})).rejects.toThrow();
    await expect(TenderBuyer.create({ workspaceId, customerName: "Qatar Energy" })).rejects.toThrow();
  });

  it("defaults status=NEW and duplicateStatus=UNIQUE", async () => {
    const buyer = await TenderBuyer.create({
      workspaceId,
      customerName: "Qatar Energy",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
    });
    expect(buyer.status).toBe("NEW");
    expect(buyer.duplicateStatus).toBe("UNIQUE");
    expect(buyer.sourceHistory).toEqual([]);
  });

  it("rejects an invalid status/duplicateStatus enum value", async () => {
    await expect(
      TenderBuyer.create({ workspaceId, customerName: "Acme", rawSearchResultId: "raw-2", discoveryRunId: "run-2", status: "NOT_A_STATUS" }),
    ).rejects.toThrow();
    await expect(
      TenderBuyer.create({ workspaceId, customerName: "Acme", rawSearchResultId: "raw-3", discoveryRunId: "run-3", duplicateStatus: "NOT_A_STATUS" }),
    ).rejects.toThrow();
  });

  it("accepts every documented status/duplicateStatus value", async () => {
    const statuses = ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"];
    const duplicateStatuses = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"];
    for (const status of statuses) {
      await expect(
        TenderBuyer.create({ workspaceId, customerName: `Status ${status}`, rawSearchResultId: "raw", discoveryRunId: "run", status }),
      ).resolves.toBeTruthy();
    }
    for (const duplicateStatus of duplicateStatuses) {
      await expect(
        TenderBuyer.create({ workspaceId, customerName: `Dup ${duplicateStatus}`, rawSearchResultId: "raw", discoveryRunId: "run", duplicateStatus }),
      ).resolves.toBeTruthy();
    }
  });
});
