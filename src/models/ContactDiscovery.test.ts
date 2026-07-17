import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ContactDiscoveryTarget, ContactExtractionRun } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-contact-discovery-model-";

describe("ContactDiscoveryTarget model", () => {
  let userId: string;
  let workspaceId: string;

  afterAll(async () => {
    await ContactDiscoveryTarget.deleteMany({ workspaceId });
    await ContactExtractionRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("creates with only the required fields, applying sensible defaults", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Discovery Model Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Discovery Model Co", userId);
    workspaceId = workspace.id;

    const target = await ContactDiscoveryTarget.create({
      workspaceId,
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: "customer-1",
      companyName: "ADNOC",
    });

    expect(target.priority).toBe("C");
    expect(target.status).toBe("NEW");
    expect(target.contactsFound).toBe(0);
    expect(target.lastQueuedAt).toBeFalsy();
    expect(target.lastSearchedAt).toBeFalsy();
  });

  it("requires companyName, relatedRecordType, and relatedRecordId", async () => {
    await expect(ContactDiscoveryTarget.create({ workspaceId, relatedRecordType: "TARGET_CUSTOMER", relatedRecordId: "customer-2" })).rejects.toThrow();
    await expect(ContactDiscoveryTarget.create({ workspaceId, companyName: "No Related Record Co" })).rejects.toThrow();
  });

  it("enforces one target per {workspaceId, relatedRecordType, relatedRecordId}", async () => {
    await ContactDiscoveryTarget.create({
      workspaceId,
      relatedRecordType: "PROJECT_OPPORTUNITY",
      relatedRecordId: "project-unique-1",
      companyName: "Unique Co",
    });

    await expect(
      ContactDiscoveryTarget.create({
        workspaceId,
        relatedRecordType: "PROJECT_OPPORTUNITY",
        relatedRecordId: "project-unique-1",
        companyName: "Unique Co Renamed",
      }),
    ).rejects.toThrow();
  });

  it("rejects a relatedRecordType outside CONTACT_RELATED_RECORD_TYPES", async () => {
    await expect(
      ContactDiscoveryTarget.create({
        workspaceId,
        relatedRecordType: "NOT_A_REAL_TYPE",
        relatedRecordId: "x",
        companyName: "Bad Type Co",
      }),
    ).rejects.toThrow();
  });
});

describe("ContactExtractionRun model", () => {
  let userId: string;
  let workspaceId: string;

  afterAll(async () => {
    await ContactExtractionRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("creates with only workspaceId, defaulting status and all counters", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}run-${Date.now()}@example.com`, name: "Contact Extraction Run Model Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Extraction Run Model Co", userId);
    workspaceId = workspace.id;

    const run = await ContactExtractionRun.create({ workspaceId });

    expect(run.status).toBe("QUEUED");
    expect(run.rawResultsProcessed).toBe(0);
    expect(run.contactsExtracted).toBe(0);
    expect(run.contactsCreated).toBe(0);
    expect(run.contactsUpdated).toBe(0);
    expect(run.skipped).toBe(0);
    expect(run.failed).toBe(0);
    expect(run.contactDiscoveryTargetId).toBeFalsy();
    expect(run.discoveryRunId).toBeFalsy();
  });
});
