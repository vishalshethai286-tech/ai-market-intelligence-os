import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TenderOpportunity, DuplicateRecord, MergeHistory, SourceHistory } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { runTenderOpportunityDeduplication, checkTenderOpportunityForDuplicates } = await import("./tender-opportunity-service");

await dbConnect();

const TEST_PREFIX = "vitest-dedup-tender-opportunity-service-";

function baseOpportunityFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [{ url: "https://example.com/source", rawSearchResultId: "raw-1", discoveryRunId: "run-1", retrievedAt: new Date() }],
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

describe("tender opportunity deduplication engine", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Dedup Tender Opportunity" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Dedup Tender Opportunity Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Dedup Tender Opportunity Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      TenderOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      DuplicateRecord.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      MergeHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      SourceHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("auto-merges a high-confidence duplicate (same tender link), preserving source URLs and logging history", async () => {
    const older = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, {
        buyerOrganization: "Public Works Department",
        tenderTitle: "Stainless Steel Pipes and Fittings Supply",
        tenderLink: "https://tenders.example.gov/pipes-dedup-test",
        country: "USA",
        tenderDescription: "",
        createdAt: new Date("2026-01-01"),
      }),
    );
    const newer = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, {
        buyerOrganization: "Public Works Department",
        tenderTitle: "Stainless Steel Pipes and Fittings Supply",
        tenderLink: "https://tenders.example.gov/pipes-dedup-test",
        country: "USA",
        tenderDescription: "Supply of stainless steel pipes and fittings for a municipal water project.",
        sourceHistory: [{ url: "https://news.example.com/pipes-dedup-other", rawSearchResultId: "raw-2", discoveryRunId: "run-2", retrievedAt: new Date() }],
        createdAt: new Date("2026-01-02"),
      }),
    );

    const summary = await runTenderOpportunityDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.autoMerged).toBeGreaterThanOrEqual(1);

    const primary = await TenderOpportunity.findById(older.id);
    const merged = await TenderOpportunity.findById(newer.id);
    expect(merged?.duplicateStatus).toBe("MERGED");
    expect(primary?.duplicateStatus).toBe("UNIQUE");
    expect(primary?.tenderDescription).toBe("Supply of stainless steel pipes and fittings for a municipal water project.");
    expect(primary?.sourceHistory.length).toBe(2);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: older.id, duplicateRecordId: newer.id });
    expect(duplicateRecord?.status).toBe("AUTO_MERGED");
    expect(duplicateRecord?.recordType).toBe("TENDER_OPPORTUNITY");

    const mergeHistory = await MergeHistory.findOne({ workspaceId, primaryRecordId: older.id, mergedRecordId: newer.id });
    expect(mergeHistory).not.toBeNull();
    expect(mergeHistory?.preservedSources).toContain("https://news.example.com/pipes-dedup-other");
  });

  it("creates a PENDING_REVIEW DuplicateRecord for an uncertain match (same buyer + title + country, no link)", async () => {
    const a = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, { buyerOrganization: "Beta Ministry", tenderTitle: "Road Resurfacing Program", country: "India", createdAt: new Date("2026-02-01") }),
    );
    const b = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, { buyerOrganization: "Beta Ministry", tenderTitle: "Road Resurfacing Program", country: "India", createdAt: new Date("2026-02-02") }),
    );

    const summary = await runTenderOpportunityDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.pendingReview).toBeGreaterThanOrEqual(1);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: a.id, duplicateRecordId: b.id });
    expect(duplicateRecord?.status).toBe("PENDING_REVIEW");
  });

  it("checkTenderOpportunityForDuplicates flags a single newly-created opportunity against existing ones", async () => {
    const existing = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, { buyerOrganization: "Gamma Council", tenderTitle: "Water Treatment Plant Upgrade", tenderLink: "https://gamma-council-dedup.example/tender-1", createdAt: new Date("2026-03-01") }),
    );
    const created = await TenderOpportunity.create(
      baseOpportunityFields(workspaceId, { buyerOrganization: "Gamma Council", tenderTitle: "Water Treatment Plant Upgrade", tenderLink: "https://gamma-council-dedup.example/tender-1", createdAt: new Date("2026-03-02") }),
    );

    const result = await checkTenderOpportunityForDuplicates(workspaceId, created.id);
    expect(result.outcome).toBe("AUTO_MERGED");

    expect((await TenderOpportunity.findById(existing.id))?.duplicateStatus).toBe("UNIQUE");
    expect((await TenderOpportunity.findById(created.id))?.duplicateStatus).toBe("MERGED");
  });

  it("is workspace-isolated — never compares or merges across workspaces", async () => {
    await TenderOpportunity.create(
      baseOpportunityFields(otherWorkspaceId, { buyerOrganization: "Cross Workspace Authority", tenderTitle: "Cross Workspace Tender", tenderLink: "https://cross-ws-tender-dedup.example/1" }),
    );
    await TenderOpportunity.create(
      baseOpportunityFields(otherWorkspaceId, { buyerOrganization: "Cross Workspace Authority", tenderTitle: "Cross Workspace Tender", tenderLink: "https://cross-ws-tender-dedup.example/1" }),
    );

    await runTenderOpportunityDeduplication(workspaceId, { mode: "SCAN_ALL" });

    const otherWorkspaceDuplicates = await DuplicateRecord.countDocuments({ workspaceId: otherWorkspaceId });
    expect(otherWorkspaceDuplicates).toBe(0);
  });
});
