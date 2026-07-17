import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunDeduplicationInput } from "./dedup";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, ProjectOpportunity, TenderBuyer, TenderOpportunity, VendorRegistration, DuplicateRecord } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { runDeduplicationAction, mergeDuplicateAction, markNotDuplicateAction, rejectDuplicateAction, archiveDuplicateAction } =
  await import("./dedup");

await dbConnect();

const TEST_PREFIX = "vitest-dedup-actions-";

function baseCustomerFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [],
    score: 50,
    confidenceScore: 0.5,
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

function baseProjectFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [],
    score: 50,
    confidenceScore: 0.5,
    status: "NEW",
    duplicateStatus: "UNIQUE",
    projectStage: "ANNOUNCED",
    ...overrides,
  };
}

function baseTenderBuyerFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [],
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

function baseTenderOpportunityFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [],
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

function baseVendorRegistrationFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    sourceHistory: [],
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

describe("dedup actions", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Dedup Actions" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Dedup Actions Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await Promise.all([
      TargetCustomer.deleteMany({ workspaceId }),
      ProjectOpportunity.deleteMany({ workspaceId }),
      TenderBuyer.deleteMany({ workspaceId }),
      TenderOpportunity.deleteMany({ workspaceId }),
      VendorRegistration.deleteMany({ workspaceId }),
      DuplicateRecord.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockReset();
    mockCookies.mockReset();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  it("runDeduplicationAction scans the workspace and returns a summary", async () => {
    await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Action Test Co", country: "USA", websiteDomain: "action-test-a.example", createdAt: new Date("2026-04-01") }));
    await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Action Test Co", country: "USA", websiteDomain: "action-test-a.example", createdAt: new Date("2026-04-02") }));

    const result = await runDeduplicationAction({ mode: "SCAN_ALL" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recordsScanned).toBeGreaterThan(0);
      expect(result.autoMerged).toBeGreaterThanOrEqual(1);
    }
  });

  it("runDeduplicationAction returns a clear error for an unsupported recordType", async () => {
    // Every real DedupRecordType (CUSTOMER/PROJECT/TENDER_BUYER/TENDER_OPPORTUNITY/VENDOR_REGISTRATION)
    // is implemented as of Phase 11 — this exercises the runtime guard itself with a value outside the enum.
    const result = await runDeduplicationAction({ recordType: "NOT_A_RECORD_TYPE" } as unknown as RunDeduplicationInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/NOT_A_RECORD_TYPE/);
  });

  it("runDeduplicationAction supports recordType=PROJECT (Phase 9)", async () => {
    await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Project Action Co", projectName: "Shared Project", projectInformationLink: "https://project-action-test.example/p", createdAt: new Date("2026-06-01") }));
    await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Project Action Co", projectName: "Shared Project", projectInformationLink: "https://project-action-test.example/p", createdAt: new Date("2026-06-02") }));

    const result = await runDeduplicationAction({ recordType: "PROJECT", mode: "SCAN_ALL" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoMerged).toBeGreaterThanOrEqual(1);
    }
  });

  it("runDeduplicationAction supports recordType=TENDER_BUYER (Phase 10)", async () => {
    await TenderBuyer.create(baseTenderBuyerFields(workspaceId, { customerName: "Tender Buyer Action Co", country: "Qatar", websiteDomain: "tender-buyer-action-test.example", createdAt: new Date("2026-07-01") }));
    await TenderBuyer.create(baseTenderBuyerFields(workspaceId, { customerName: "Tender Buyer Action Co", country: "Qatar", websiteDomain: "tender-buyer-action-test.example", createdAt: new Date("2026-07-02") }));

    const result = await runDeduplicationAction({ recordType: "TENDER_BUYER", mode: "SCAN_ALL" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoMerged).toBeGreaterThanOrEqual(1);
    }
  });

  it("runDeduplicationAction supports recordType=TENDER_OPPORTUNITY (Phase 10)", async () => {
    await TenderOpportunity.create(baseTenderOpportunityFields(workspaceId, { buyerOrganization: "Tender Opportunity Action Authority", tenderTitle: "Shared Tender", tenderLink: "https://tender-opportunity-action-test.example/t", createdAt: new Date("2026-07-03") }));
    await TenderOpportunity.create(baseTenderOpportunityFields(workspaceId, { buyerOrganization: "Tender Opportunity Action Authority", tenderTitle: "Shared Tender", tenderLink: "https://tender-opportunity-action-test.example/t", createdAt: new Date("2026-07-04") }));

    const result = await runDeduplicationAction({ recordType: "TENDER_OPPORTUNITY", mode: "SCAN_ALL" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoMerged).toBeGreaterThanOrEqual(1);
    }
  });

  it("mergeDuplicateAction works for a TENDER_BUYER DuplicateRecord (Phase 10)", async () => {
    const a = await TenderBuyer.create(baseTenderBuyerFields(workspaceId, { customerName: "Merge Tender Buyer Co", createdAt: new Date("2026-07-10") }));
    const b = await TenderBuyer.create(baseTenderBuyerFields(workspaceId, { customerName: "Merge Tender Buyer Co", createdAt: new Date("2026-07-11") }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "TENDER_BUYER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("MANUALLY_MERGED");
    const mergedBuyer = await TenderBuyer.findById(b.id);
    expect(mergedBuyer?.duplicateStatus).toBe("MERGED");
  });

  it("mergeDuplicateAction works for a TENDER_OPPORTUNITY DuplicateRecord (Phase 10)", async () => {
    const a = await TenderOpportunity.create(baseTenderOpportunityFields(workspaceId, { buyerOrganization: "Merge Tender Opportunity Authority", tenderTitle: "Merge Tender", createdAt: new Date("2026-07-12") }));
    const b = await TenderOpportunity.create(baseTenderOpportunityFields(workspaceId, { buyerOrganization: "Merge Tender Opportunity Authority", tenderTitle: "Merge Tender", createdAt: new Date("2026-07-13") }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "TENDER_OPPORTUNITY",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("MANUALLY_MERGED");
    const mergedOpportunity = await TenderOpportunity.findById(b.id);
    expect(mergedOpportunity?.duplicateStatus).toBe("MERGED");
  });

  it("runDeduplicationAction supports recordType=VENDOR_REGISTRATION (Phase 11)", async () => {
    await VendorRegistration.create(baseVendorRegistrationFields(workspaceId, { customerName: "Vendor Registration Action Co", country: "UAE", websiteDomain: "vendor-registration-action-test.example", createdAt: new Date("2026-07-20") }));
    await VendorRegistration.create(baseVendorRegistrationFields(workspaceId, { customerName: "Vendor Registration Action Co", country: "UAE", websiteDomain: "vendor-registration-action-test.example", createdAt: new Date("2026-07-21") }));

    const result = await runDeduplicationAction({ recordType: "VENDOR_REGISTRATION", mode: "SCAN_ALL" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoMerged).toBeGreaterThanOrEqual(1);
    }
  });

  it("mergeDuplicateAction works for a VENDOR_REGISTRATION DuplicateRecord (Phase 11)", async () => {
    const a = await VendorRegistration.create(baseVendorRegistrationFields(workspaceId, { customerName: "Merge Vendor Registration Co", createdAt: new Date("2026-07-22") }));
    const b = await VendorRegistration.create(baseVendorRegistrationFields(workspaceId, { customerName: "Merge Vendor Registration Co", createdAt: new Date("2026-07-23") }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "VENDOR_REGISTRATION",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("MANUALLY_MERGED");
    const mergedRegistration = await VendorRegistration.findById(b.id);
    expect(mergedRegistration?.duplicateStatus).toBe("MERGED");
  });

  it("mergeDuplicateAction works for a PROJECT DuplicateRecord (Phase 9)", async () => {
    const a = await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Merge Project Co", projectName: "Merge Project", createdAt: new Date("2026-06-10") }));
    const b = await ProjectOpportunity.create(baseProjectFields(workspaceId, { clientName: "Merge Project Co", projectName: "Merge Project", createdAt: new Date("2026-06-11") }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "PROJECT",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      status: "PENDING_REVIEW",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("MANUALLY_MERGED");
    const mergedProject = await ProjectOpportunity.findById(b.id);
    expect(mergedProject?.duplicateStatus).toBe("MERGED");
  });

  it("mergeDuplicateAction performs a manual merge and marks the DuplicateRecord MANUALLY_MERGED", async () => {
    const a = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Merge Action Co", country: "USA", websiteDomain: null, createdAt: new Date("2026-05-01") }));
    const b = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Merge Action Co", country: "USA", websiteDomain: null, createdAt: new Date("2026-05-02") }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "test fixture",
      matchingFields: ["customerName", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("MANUALLY_MERGED");
    const mergedCustomer = await TargetCustomer.findById(b.id);
    expect(mergedCustomer?.duplicateStatus).toBe("MERGED");
  });

  it("mergeDuplicateAction rejects a record that isn't PENDING_REVIEW", async () => {
    const a = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Already Resolved Co" }));
    const b = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Already Resolved Co" }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      status: "NOT_DUPLICATE",
    });

    const result = await mergeDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(false);
  });

  it("markNotDuplicateAction keeps both customers active and doesn't merge fields", async () => {
    const a = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Keep Separate Co A", duplicateStatus: "POSSIBLE_DUPLICATE" }));
    const b = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Keep Separate Co B", duplicateStatus: "POSSIBLE_DUPLICATE" }));
    const duplicateRecord = await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 76,
      status: "PENDING_REVIEW",
    });

    const result = await markNotDuplicateAction(duplicateRecord.id);
    expect(result.ok).toBe(true);

    const updatedRecord = await DuplicateRecord.findById(duplicateRecord.id);
    expect(updatedRecord?.status).toBe("NOT_DUPLICATE");
    const customerA = await TargetCustomer.findById(a.id);
    const customerB = await TargetCustomer.findById(b.id);
    expect(customerA?.duplicateStatus).toBe("UNIQUE");
    expect(customerB?.duplicateStatus).toBe("UNIQUE");
  });

  it("rejectDuplicateAction and archiveDuplicateAction set the expected terminal status", async () => {
    const a = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Reject Co" }));
    const b = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Reject Co Dup" }));
    const rejectRecord = await DuplicateRecord.create({ workspaceId, recordType: "CUSTOMER", primaryRecordId: a.id, duplicateRecordId: b.id, duplicateScore: 76, status: "PENDING_REVIEW" });
    const rejectResult = await rejectDuplicateAction(rejectRecord.id);
    expect(rejectResult.ok).toBe(true);
    expect((await DuplicateRecord.findById(rejectRecord.id))?.status).toBe("REJECTED");

    const c = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Archive Co" }));
    const d = await TargetCustomer.create(baseCustomerFields(workspaceId, { customerName: "Archive Co Dup" }));
    const archiveRecord = await DuplicateRecord.create({ workspaceId, recordType: "CUSTOMER", primaryRecordId: c.id, duplicateRecordId: d.id, duplicateScore: 76, status: "PENDING_REVIEW" });
    const archiveResult = await archiveDuplicateAction(archiveRecord.id);
    expect(archiveResult.ok).toBe(true);
    expect((await DuplicateRecord.findById(archiveRecord.id))?.status).toBe("ARCHIVED");
  });
});
