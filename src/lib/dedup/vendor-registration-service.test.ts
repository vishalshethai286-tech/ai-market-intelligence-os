import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration, DuplicateRecord, MergeHistory, SourceHistory } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { runVendorRegistrationDeduplication, checkVendorRegistrationForDuplicates } = await import("./vendor-registration-service");

await dbConnect();

const TEST_PREFIX = "vitest-dedup-vendor-registration-service-";

function baseRegistrationFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
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

describe("vendor registration deduplication engine", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Dedup Vendor Registration" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Dedup Vendor Registration Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Dedup Vendor Registration Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      VendorRegistration.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      DuplicateRecord.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      MergeHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      SourceHistory.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    ]);
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("auto-merges a high-confidence duplicate (same website domain), preserving source URLs and logging history", async () => {
    const older = await VendorRegistration.create(
      baseRegistrationFields(workspaceId, {
        customerName: "ADNOC",
        country: "United Arab Emirates",
        websiteDomain: "adnoc-dedup-test.com",
        address: null,
        createdAt: new Date("2026-01-01"),
      }),
    );
    const newer = await VendorRegistration.create(
      baseRegistrationFields(workspaceId, {
        customerName: "ADNOC",
        country: "United Arab Emirates",
        websiteDomain: "adnoc-dedup-test.com",
        address: "PO Box 898, Abu Dhabi",
        sourceHistory: [{ url: "https://adnoc-dedup-test.com/other", rawSearchResultId: "raw-2", discoveryRunId: "run-2", retrievedAt: new Date() }],
        createdAt: new Date("2026-01-02"),
      }),
    );

    const summary = await runVendorRegistrationDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.autoMerged).toBeGreaterThanOrEqual(1);

    const primary = await VendorRegistration.findById(older.id);
    const merged = await VendorRegistration.findById(newer.id);
    expect(merged?.duplicateStatus).toBe("MERGED");
    expect(primary?.duplicateStatus).toBe("UNIQUE");
    expect(primary?.address).toBe("PO Box 898, Abu Dhabi");
    expect(primary?.sourceHistory.length).toBe(2);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: older.id, duplicateRecordId: newer.id });
    expect(duplicateRecord?.status).toBe("AUTO_MERGED");
    expect(duplicateRecord?.recordType).toBe("VENDOR_REGISTRATION");

    const mergeHistory = await MergeHistory.findOne({ workspaceId, primaryRecordId: older.id, mergedRecordId: newer.id });
    expect(mergeHistory).not.toBeNull();
    expect(mergeHistory?.preservedSources).toContain("https://adnoc-dedup-test.com/other");
  });

  it("creates a PENDING_REVIEW DuplicateRecord for an uncertain match (same name + country only)", async () => {
    const a = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Beta Refinery", country: "India", createdAt: new Date("2026-02-01") }));
    const b = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Beta Refinery", country: "India", createdAt: new Date("2026-02-02") }));

    const summary = await runVendorRegistrationDeduplication(workspaceId, { mode: "SCAN_ALL" });
    expect(summary.pendingReview).toBeGreaterThanOrEqual(1);

    const duplicateRecord = await DuplicateRecord.findOne({ workspaceId, primaryRecordId: a.id, duplicateRecordId: b.id });
    expect(duplicateRecord?.status).toBe("PENDING_REVIEW");
  });

  it("checkVendorRegistrationForDuplicates flags a single newly-created registration against existing ones", async () => {
    const existing = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Gamma Petrochem", websiteDomain: "gamma-petrochem-dedup.example", createdAt: new Date("2026-03-01") }));
    const created = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Gamma Petrochem", websiteDomain: "gamma-petrochem-dedup.example", createdAt: new Date("2026-03-02") }));

    const result = await checkVendorRegistrationForDuplicates(workspaceId, created.id);
    expect(result.outcome).toBe("AUTO_MERGED");

    expect((await VendorRegistration.findById(existing.id))?.duplicateStatus).toBe("UNIQUE");
    expect((await VendorRegistration.findById(created.id))?.duplicateStatus).toBe("MERGED");
  });

  it("is workspace-isolated — never compares or merges across workspaces", async () => {
    await VendorRegistration.create(baseRegistrationFields(otherWorkspaceId, { customerName: "Cross Workspace Vendor", websiteDomain: "cross-ws-vendor-dedup.example" }));
    await VendorRegistration.create(baseRegistrationFields(otherWorkspaceId, { customerName: "Cross Workspace Vendor", websiteDomain: "cross-ws-vendor-dedup.example" }));

    await runVendorRegistrationDeduplication(workspaceId, { mode: "SCAN_ALL" });

    const otherWorkspaceDuplicates = await DuplicateRecord.countDocuments({ workspaceId: otherWorkspaceId });
    expect(otherWorkspaceDuplicates).toBe(0);
  });
});
