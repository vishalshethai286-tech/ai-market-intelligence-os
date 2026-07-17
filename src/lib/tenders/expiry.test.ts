import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { updateExpiredTenders } = await import("./expiry");

await dbConnect();

const TEST_PREFIX = "vitest-tenders-expiry-";

function baseOpportunityFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    buyerOrganization: "Public Works Department",
    tenderTitle: "Expiry Test Tender",
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    status: "NEW",
    ...overrides,
  };
}

describe("updateExpiredTenders", () => {
  let userId: string;
  let workspaceId: string;

  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Expiry" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Expiry Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await TenderOpportunity.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("marks a past-endDate, non-exempt-status tender as EXPIRED", async () => {
    const tender = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { endDate: pastDate, status: "NEW" }));

    const summary = await updateExpiredTenders(workspaceId);
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const updated = await TenderOpportunity.findById(tender.id);
    expect(updated?.status).toBe("EXPIRED");
  });

  it("keeps a future-endDate tender as-is (not expired)", async () => {
    const tender = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { endDate: futureDate, status: "NEW" }));

    await updateExpiredTenders(workspaceId);

    const updated = await TenderOpportunity.findById(tender.id);
    expect(updated?.status).toBe("NEW");
  });

  it("keeps a null/unknown-endDate tender as-is (not expired)", async () => {
    const tender = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { endDate: null, status: "NEW" }));

    await updateExpiredTenders(workspaceId);

    const updated = await TenderOpportunity.findById(tender.id);
    expect(updated?.status).toBe("NEW");
  });

  it("never overrides exempt statuses (Won/Lost/Submitted/Archived), even with a past endDate", async () => {
    const exemptStatuses = ["WON", "LOST", "SUBMITTED", "ARCHIVED"];
    const tenders = await Promise.all(
      exemptStatuses.map((status) => TenderOpportunity.create(baseOpportunityFields(workspaceId, { endDate: pastDate, status }))),
    );

    await updateExpiredTenders(workspaceId);

    for (let i = 0; i < tenders.length; i++) {
      const updated = await TenderOpportunity.findById(tenders[i].id);
      expect(updated?.status).toBe(exemptStatuses[i]);
    }
  });

  it("never deletes any tender — it only updates status", async () => {
    const tender = await TenderOpportunity.create(baseOpportunityFields(workspaceId, { endDate: pastDate, status: "REVIEWED" }));

    await updateExpiredTenders(workspaceId);

    const stillExists = await TenderOpportunity.findById(tender.id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("EXPIRED");
  });
});
