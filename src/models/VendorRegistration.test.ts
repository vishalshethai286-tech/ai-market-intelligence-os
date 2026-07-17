import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-vendor-registration-model-";

describe("VendorRegistration model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await VendorRegistration.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId, customerName, rawSearchResultId, and discoveryRunId", async () => {
    await expect(VendorRegistration.create({})).rejects.toThrow();
    await expect(VendorRegistration.create({ workspaceId, customerName: "ADNOC" })).rejects.toThrow();
  });

  it("defaults status=NEW, duplicateStatus=UNIQUE, requiredDocuments=[]", async () => {
    const registration = await VendorRegistration.create({
      workspaceId,
      customerName: "ADNOC",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
    });
    expect(registration.status).toBe("NEW");
    expect(registration.duplicateStatus).toBe("UNIQUE");
    expect(registration.requiredDocuments).toEqual([]);
    expect(registration.sourceHistory).toEqual([]);
  });

  it("rejects an invalid status/duplicateStatus enum value", async () => {
    await expect(
      VendorRegistration.create({
        workspaceId,
        customerName: "Acme",
        rawSearchResultId: "raw-2",
        discoveryRunId: "run-2",
        status: "NOT_A_STATUS",
      }),
    ).rejects.toThrow();
    await expect(
      VendorRegistration.create({
        workspaceId,
        customerName: "Acme",
        rawSearchResultId: "raw-3",
        discoveryRunId: "run-3",
        duplicateStatus: "NOT_A_DUPLICATE_STATUS",
      }),
    ).rejects.toThrow();
  });

  it("accepts every documented status/duplicateStatus value", async () => {
    const statuses = ["NEW", "REVIEWED", "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "ARCHIVED"];
    const duplicateStatuses = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"];

    for (const status of statuses) {
      await expect(
        VendorRegistration.create({ workspaceId, customerName: `Status ${status}`, rawSearchResultId: "raw", discoveryRunId: "run", status }),
      ).resolves.toBeTruthy();
    }
    for (const duplicateStatus of duplicateStatuses) {
      await expect(
        VendorRegistration.create({ workspaceId, customerName: `Dup ${duplicateStatus}`, rawSearchResultId: "raw", discoveryRunId: "run", duplicateStatus }),
      ).resolves.toBeTruthy();
    }
  });
});
