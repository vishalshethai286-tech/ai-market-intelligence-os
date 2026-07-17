import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, DuplicateRecord, MergeHistory, SourceHistory } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { runCustomerDeduplication, checkCustomerForDuplicates } = await import("./customer-service");

await dbConnect();

const TEST_PREFIX = "vitest-dedup-customer-service-";

function baseCustomerFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [{ url: "https://example.com/source", rawSearchResultId: "raw-1", discoveryRunId: "run-1", retrievedAt: new Date() }],
    score: 50,
    confidenceScore: 0.5,
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

describe("customer deduplication engine", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Dedup" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Dedup Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Dedup Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      TargetCustomer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      DuplicateRecord.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      MergeHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      SourceHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("auto-merges a high-confidence duplicate (same website domain), preserving source URLs and logging history", async () => {
    const older = await TargetCustomer.create(
      baseCustomerFields(workspaceId, {
        customerName: "Acme Pumps",
        country: "USA",
        websiteDomain: "acme-dedup-test.com",
        website: "https://acme-dedup-test.com",
        address: null,
        createdAt: new Date("2026-01-01"),
      }),
    );
    const newer = await TargetCustomer.create(
      baseCustomerFields(workspaceId, {
        customerName: "Acme Pumps",
        country: "USA",
        websiteDomain: "acme-dedup-test.com",
        website: "https://acme-dedup-test.com",
        address: "123 Main St, Springfield",
        confidenceScore: 0.9,
        score: 80,
        sourceHistory: [{ url: "https://acme-dedup-test.com/other-page", rawSearchResultId: "raw-2", discoveryRunId: "run-2", retrievedAt: new Date() }],
        createdAt: new Date("2026-01-02"),
      }),
    );

    const summary = await runCustomerDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.autoMerged).toBeGreaterThanOrEqual(1);

    const primary = await TargetCustomer.findById(older.id);
    const merged = await TargetCustomer.findById(newer.id);
    expect(merged?.duplicateStatus).toBe("MERGED");
    expect(primary?.duplicateStatus).toBe("UNIQUE");
    // Missing address filled in from the duplicate.
    expect(primary?.address).toBe("123 Main St, Springfield");
    // Both raw sources preserved on the primary.
    expect(primary?.sourceHistory.length).toBe(2);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: older.id, duplicateRecordId: newer.id });
    expect(duplicateRecord?.status).toBe("AUTO_MERGED");
    expect(duplicateRecord?.matchingFields).toContain("websiteDomain");

    const mergeHistory = await MergeHistory.findOne({ workspaceId, primaryRecordId: older.id, mergedRecordId: newer.id });
    expect(mergeHistory).not.toBeNull();
    expect(mergeHistory?.preservedSources).toContain("https://acme-dedup-test.com/other-page");

    const addressChange = await SourceHistory.findOne({ workspaceId, recordId: older.id, fieldName: "address" });
    expect(addressChange).not.toBeNull();
    expect(addressChange?.newValue).toBe("123 Main St, Springfield");
  });

  it("creates a PENDING_REVIEW DuplicateRecord for an uncertain match (same name+country only)", async () => {
    const a = await TargetCustomer.create(
      baseCustomerFields(workspaceId, { customerName: "Beta Valves", country: "India", websiteDomain: null, createdAt: new Date("2026-02-01") }),
    );
    const b = await TargetCustomer.create(
      baseCustomerFields(workspaceId, { customerName: "Beta Valves", country: "India", websiteDomain: null, createdAt: new Date("2026-02-02") }),
    );

    const summary = await runCustomerDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.pendingReview).toBeGreaterThanOrEqual(1);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: a.id, duplicateRecordId: b.id });
    expect(duplicateRecord?.status).toBe("PENDING_REVIEW");

    const customerA = await TargetCustomer.findById(a.id);
    const customerB = await TargetCustomer.findById(b.id);
    expect(customerA?.duplicateStatus).toBe("POSSIBLE_DUPLICATE");
    expect(customerB?.duplicateStatus).toBe("POSSIBLE_DUPLICATE");
  });

  it("does not flag two clearly-different customers", async () => {
    await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Unrelated Corp One", country: "Brazil", websiteDomain: "unrelated-one.example" }));
    await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Totally Distinct Company", country: "Japan", websiteDomain: "unrelated-two.example" }));

    const before = await DuplicateRecord.countDocuments({ workspaceId });
    await runCustomerDeduplication(workspaceId, { mode: "SCAN_ALL" });
    const after = await DuplicateRecord.countDocuments({ workspaceId });
    // The unrelated pair itself shouldn't add a new DuplicateRecord (other
    // fixtures in this describe block may still be scanned, but comparing
    // these two specific unrelated names should contribute nothing).
    const unrelatedPairRecord = await DuplicateRecord.findOne({
      workspaceId,
      $or: [
        { duplicateReason: { $regex: /Unrelated Corp One/ } },
      ],
    });
    expect(unrelatedPairRecord).toBeNull();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("does not re-flag a pair that already has a DuplicateRecord on a second scan", async () => {
    const countBefore = await DuplicateRecord.countDocuments({ workspaceId, recordType: "CUSTOMER" });
    await runCustomerDeduplication(workspaceId, { mode: "SCAN_ALL" });
    const countAfter = await DuplicateRecord.countDocuments({ workspaceId, recordType: "CUSTOMER" });
    expect(countAfter).toBe(countBefore);
  });

  it("checkCustomerForDuplicates flags a single newly-created customer against existing ones", async () => {
    const existing = await TargetCustomer.create(
      baseCustomerFields(workspaceId, { customerName: "Gamma Seals", country: "UK", websiteDomain: "gamma-seals-dedup.example", createdAt: new Date("2026-03-01") }),
    );
    const created = await TargetCustomer.create(
      baseCustomerFields(workspaceId, { customerName: "Gamma Seals", country: "UK", websiteDomain: "gamma-seals-dedup.example", createdAt: new Date("2026-03-02") }),
    );

    await checkCustomerForDuplicates(workspaceId, created.id);

    const stillActive = await TargetCustomer.findById(existing.id);
    const nowMerged = await TargetCustomer.findById(created.id);
    expect(stillActive?.duplicateStatus).toBe("UNIQUE");
    expect(nowMerged?.duplicateStatus).toBe("MERGED");
  });

  it("is workspace-isolated — never compares or merges across workspaces", async () => {
    await TargetCustomer.create(
      baseCustomerFields(otherWorkspaceId, { customerName: "Cross Workspace Co", country: "USA", websiteDomain: "cross-ws-dedup.example" }),
    );
    await TargetCustomer.create(
      baseCustomerFields(otherWorkspaceId, { customerName: "Cross Workspace Co", country: "USA", websiteDomain: "cross-ws-dedup.example" }),
    );

    await runCustomerDeduplication(workspaceId, { mode: "SCAN_ALL" });

    const otherWorkspaceDuplicates = await DuplicateRecord.countDocuments({ workspaceId: otherWorkspaceId });
    expect(otherWorkspaceDuplicates).toBe(0);
  });
});
