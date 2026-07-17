import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-tender-opportunity-model-";

describe("TenderOpportunity model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await TenderOpportunity.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId, buyerOrganization, tenderTitle, rawSearchResultId, and discoveryRunId", async () => {
    await expect(TenderOpportunity.create({})).rejects.toThrow();
    await expect(TenderOpportunity.create({ workspaceId, buyerOrganization: "Public Works Department" })).rejects.toThrow();
  });

  it("defaults status=NEW, duplicateStatus=UNIQUE, score/priorityScore=0", async () => {
    const opportunity = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Public Works Department",
      tenderTitle: "Stainless Steel Pipes Supply",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
    });
    expect(opportunity.status).toBe("NEW");
    expect(opportunity.duplicateStatus).toBe("UNIQUE");
    expect(opportunity.priorityScore).toBe(0);
    expect(opportunity.productsServicesRequired).toEqual([]);
    expect(opportunity.sourceHistory).toEqual([]);
  });

  it("rejects an invalid status/priority/duplicateStatus enum value", async () => {
    await expect(
      TenderOpportunity.create({
        workspaceId,
        buyerOrganization: "Acme",
        tenderTitle: "Bad Status",
        rawSearchResultId: "raw-2",
        discoveryRunId: "run-2",
        status: "NOT_A_STATUS",
      }),
    ).rejects.toThrow();
    await expect(
      TenderOpportunity.create({
        workspaceId,
        buyerOrganization: "Acme",
        tenderTitle: "Bad Priority",
        rawSearchResultId: "raw-3",
        discoveryRunId: "run-3",
        priority: "Z",
      }),
    ).rejects.toThrow();
  });

  it("accepts every documented status/priority/duplicateStatus value", async () => {
    const statuses = ["NEW", "REVIEWED", "ELIGIBLE", "NOT_ELIGIBLE", "SUBMITTED", "WON", "LOST", "EXPIRED", "ARCHIVED"];
    const priorities = ["A_PLUS", "A", "B", "C"];
    const duplicateStatuses = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"];

    for (const status of statuses) {
      await expect(
        TenderOpportunity.create({ workspaceId, buyerOrganization: "Acme", tenderTitle: `Status ${status}`, rawSearchResultId: "raw", discoveryRunId: "run", status }),
      ).resolves.toBeTruthy();
    }
    for (const priority of priorities) {
      await expect(
        TenderOpportunity.create({ workspaceId, buyerOrganization: "Acme", tenderTitle: `Priority ${priority}`, rawSearchResultId: "raw", discoveryRunId: "run", priority }),
      ).resolves.toBeTruthy();
    }
    for (const duplicateStatus of duplicateStatuses) {
      await expect(
        TenderOpportunity.create({ workspaceId, buyerOrganization: "Acme", tenderTitle: `Dup ${duplicateStatus}`, rawSearchResultId: "raw", discoveryRunId: "run", duplicateStatus }),
      ).resolves.toBeTruthy();
    }
  });
});
