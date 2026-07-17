import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ProjectOpportunity, DuplicateRecord, MergeHistory, SourceHistory } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { runProjectDeduplication, checkProjectForDuplicates } = await import("./project-service");

await dbConnect();

const TEST_PREFIX = "vitest-dedup-project-service-";

function baseProjectFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [{ url: "https://example.com/source", rawSearchResultId: "raw-1", discoveryRunId: "run-1", retrievedAt: new Date() }],
    score: 50,
    confidenceScore: 0.5,
    status: "NEW",
    duplicateStatus: "UNIQUE",
    projectStage: "ANNOUNCED",
    ...overrides,
  };
}

describe("project deduplication engine", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Dedup Project" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Dedup Project Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Dedup Project Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      ProjectOpportunity.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      DuplicateRecord.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      MergeHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      SourceHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("auto-merges a high-confidence duplicate (same project-information link), preserving source URLs and logging history", async () => {
    const older = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Acme Refining",
        projectName: "New Refinery Expansion",
        country: "USA",
        projectInformationLink: "https://acme-dedup-test.com/refinery",
        location: null,
        createdAt: new Date("2026-01-01"),
      }),
    );
    const newer = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Acme Refining",
        projectName: "New Refinery Expansion",
        country: "USA",
        projectInformationLink: "https://acme-dedup-test.com/refinery",
        location: "Houston, Texas",
        confidenceScore: 0.9,
        score: 80,
        sourceHistory: [{ url: "https://acme-dedup-test.com/refinery/update", rawSearchResultId: "raw-2", discoveryRunId: "run-2", retrievedAt: new Date() }],
        createdAt: new Date("2026-01-02"),
      }),
    );

    const summary = await runProjectDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.autoMerged).toBeGreaterThanOrEqual(1);

    const primary = await ProjectOpportunity.findById(older.id);
    const merged = await ProjectOpportunity.findById(newer.id);
    expect(merged?.duplicateStatus).toBe("MERGED");
    expect(primary?.duplicateStatus).toBe("UNIQUE");
    expect(primary?.location).toBe("Houston, Texas");
    expect(primary?.sourceHistory.length).toBe(2);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: older.id, duplicateRecordId: newer.id });
    expect(duplicateRecord?.status).toBe("AUTO_MERGED");
    expect(duplicateRecord?.recordType).toBe("PROJECT");
    expect(duplicateRecord?.matchingFields).toContain("projectInformationLink");

    const mergeHistory = await MergeHistory.findOne({ workspaceId, primaryRecordId: older.id, mergedRecordId: newer.id });
    expect(mergeHistory).not.toBeNull();
    expect(mergeHistory?.preservedSources).toContain("https://acme-dedup-test.com/refinery/update");

    const locationChange = await SourceHistory.findOne({ workspaceId, recordType: "PROJECT", recordId: older.id, fieldName: "location" });
    expect(locationChange).not.toBeNull();
    expect(locationChange?.newValue).toBe("Houston, Texas");
  });

  it("creates a PENDING_REVIEW DuplicateRecord for an uncertain match (same project name + country + contractor)", async () => {
    const a = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Beta Client A",
        projectName: "Plant Expansion Phase 2",
        country: "India",
        contractorName: "SharedContractor EPC",
        createdAt: new Date("2026-02-01"),
      }),
    );
    const b = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Beta Client B",
        projectName: "Plant Expansion Phase 2",
        country: "India",
        contractorName: "SharedContractor EPC",
        createdAt: new Date("2026-02-02"),
      }),
    );

    const summary = await runProjectDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.pendingReview).toBeGreaterThanOrEqual(1);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: a.id, duplicateRecordId: b.id });
    expect(duplicateRecord?.status).toBe("PENDING_REVIEW");

    const projectA = await ProjectOpportunity.findById(a.id);
    const projectB = await ProjectOpportunity.findById(b.id);
    expect(projectA?.duplicateStatus).toBe("POSSIBLE_DUPLICATE");
    expect(projectB?.duplicateStatus).toBe("POSSIBLE_DUPLICATE");
  });

  it("does not flag two clearly-different projects", async () => {
    await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Gamma One", projectName: "Solar Farm Alpha", country: "Brazil" }));
    await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Delta Two", projectName: "Data Center Beta", country: "Japan" }));

    const unrelatedPairRecord = await DuplicateRecord.findOne({ workspaceId, duplicateReason: { $regex: /Gamma One/ } });
    expect(unrelatedPairRecord).toBeNull();
  });

  it("checkProjectForDuplicates flags a single newly-created project against existing ones", async () => {
    const existing = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Epsilon Corp",
        projectName: "New Terminal Build",
        projectInformationLink: "https://epsilon-dedup.example/terminal",
        createdAt: new Date("2026-03-01"),
      }),
    );
    const created = await ProjectOpportunity.create(
      baseProjectFields(workspaceId, {
        clientName: "Epsilon Corp",
        projectName: "New Terminal Build",
        projectInformationLink: "https://epsilon-dedup.example/terminal",
        createdAt: new Date("2026-03-02"),
      }),
    );

    const result = await checkProjectForDuplicates(workspaceId, created.id);
    expect(result.outcome).toBe("AUTO_MERGED");

    const stillActive = await ProjectOpportunity.findById(existing.id);
    const nowMerged = await ProjectOpportunity.findById(created.id);
    expect(stillActive?.duplicateStatus).toBe("UNIQUE");
    expect(nowMerged?.duplicateStatus).toBe("MERGED");
  });

  it("is workspace-isolated — never compares or merges across workspaces", async () => {
    await ProjectOpportunity.create(
      baseProjectFields(otherWorkspaceId, { clientName: "Cross Workspace Co", projectName: "Shared Name Project", projectInformationLink: "https://cross-ws-dedup.example/p" }),
    );
    await ProjectOpportunity.create(
      baseProjectFields(otherWorkspaceId, { clientName: "Cross Workspace Co", projectName: "Shared Name Project", projectInformationLink: "https://cross-ws-dedup.example/p" }),
    );

    await runProjectDeduplication(workspaceId, { mode: "SCAN_ALL" });

    const otherWorkspaceDuplicates = await DuplicateRecord.countDocuments({ workspaceId: otherWorkspaceId });
    expect(otherWorkspaceDuplicates).toBe(0);
  });
});
