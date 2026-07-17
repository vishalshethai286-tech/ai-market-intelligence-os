import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, ContactActivity, ContactImportBatch } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-contact-model-";

describe("Contact model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await Contact.deleteMany({ workspaceId });
    await ContactActivity.deleteMany({ workspaceId });
    await ContactImportBatch.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId and fullName", async () => {
    await expect(Contact.create({})).rejects.toThrow();
    await expect(Contact.create({ workspaceId })).rejects.toThrow();
  });

  it("defaults status=NEW, duplicateStatus=UNIQUE, roleCategory=OTHER, seniority=UNKNOWN, emailStatus=UNKNOWN, sourceType=MANUAL_ENTRY, tags/sourceHistory=[]", async () => {
    const contact = await Contact.create({ workspaceId, fullName: "Jane Doe" });
    expect(contact.status).toBe("NEW");
    expect(contact.duplicateStatus).toBe("UNIQUE");
    expect(contact.roleCategory).toBe("OTHER");
    expect(contact.seniority).toBe("UNKNOWN");
    expect(contact.emailStatus).toBe("UNKNOWN");
    expect(contact.sourceType).toBe("MANUAL_ENTRY");
    expect(contact.tags).toEqual([]);
    expect(contact.sourceHistory).toEqual([]);
    expect(contact.priorityScore).toBe(0);
  });

  it("rejects an invalid status/roleCategory/seniority/duplicateStatus enum value", async () => {
    await expect(Contact.create({ workspaceId, fullName: "Bad Status", status: "NOT_A_STATUS" })).rejects.toThrow();
    await expect(Contact.create({ workspaceId, fullName: "Bad Role", roleCategory: "NOT_A_ROLE" })).rejects.toThrow();
    await expect(Contact.create({ workspaceId, fullName: "Bad Seniority", seniority: "NOT_A_SENIORITY" })).rejects.toThrow();
    await expect(Contact.create({ workspaceId, fullName: "Bad Dup", duplicateStatus: "NOT_A_DUP_STATUS" })).rejects.toThrow();
  });

  it("accepts every documented status/roleCategory/seniority/duplicateStatus value", async () => {
    const statuses = ["NEW", "REVIEWED", "APPROVED", "REJECTED", "CONTACTED", "RESPONDED", "FOLLOW_UP", "NOT_RELEVANT", "ARCHIVED"];
    const roleCategories = [
      "PROCUREMENT",
      "PURCHASE",
      "SOURCING",
      "SUPPLY_CHAIN",
      "VENDOR_MANAGEMENT",
      "PROJECT_MANAGEMENT",
      "ENGINEERING",
      "MAINTENANCE",
      "PLANT_OPERATIONS",
      "OPERATIONS",
      "COMMERCIAL",
      "CONTRACTS",
      "TENDERING",
      "QUALITY",
      "TECHNICAL",
      "MANAGEMENT",
      "FINANCE",
      "ADMINISTRATION",
      "OTHER",
    ];
    const seniorities = ["OWNER", "PRESIDENT", "CEO", "DIRECTOR", "VP", "HEAD", "MANAGER", "ENGINEER", "EXECUTIVE", "OFFICER", "COORDINATOR", "UNKNOWN"];
    const duplicateStatuses = ["UNIQUE", "POSSIBLE_DUPLICATE", "DUPLICATE", "MERGED", "REJECTED"];

    for (const status of statuses) {
      await expect(Contact.create({ workspaceId, fullName: `Status ${status}`, status })).resolves.toBeTruthy();
    }
    for (const roleCategory of roleCategories) {
      await expect(Contact.create({ workspaceId, fullName: `Role ${roleCategory}`, roleCategory })).resolves.toBeTruthy();
    }
    for (const seniority of seniorities) {
      await expect(Contact.create({ workspaceId, fullName: `Seniority ${seniority}`, seniority })).resolves.toBeTruthy();
    }
    for (const duplicateStatus of duplicateStatuses) {
      await expect(Contact.create({ workspaceId, fullName: `Dup ${duplicateStatus}`, duplicateStatus })).resolves.toBeTruthy();
    }
  });
});

describe("ContactActivity model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}activity-${Date.now()}@example.com`, name: "Activity Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Activity Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await ContactActivity.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId, contactId, activityType, and activityDate", async () => {
    await expect(ContactActivity.create({})).rejects.toThrow();
    await expect(ContactActivity.create({ workspaceId, contactId: "contact-1" })).rejects.toThrow();
  });

  it("rejects an invalid activityType", async () => {
    await expect(
      ContactActivity.create({ workspaceId, contactId: "contact-1", activityType: "NOT_A_TYPE", activityDate: new Date() }),
    ).rejects.toThrow();
  });

  it("accepts every documented activityType", async () => {
    const types = ["NOTE", "CALL", "EMAIL", "MEETING", "FOLLOW_UP", "STATUS_CHANGE", "VERIFICATION", "MANUAL_UPDATE", "OTHER"];
    for (const activityType of types) {
      await expect(
        ContactActivity.create({ workspaceId, contactId: "contact-1", activityType, activityDate: new Date() }),
      ).resolves.toBeTruthy();
    }
  });
});

describe("ContactImportBatch model", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}import-${Date.now()}@example.com`, name: "Import Batch Model" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Import Batch Model Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await ContactImportBatch.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("requires workspaceId and fileName", async () => {
    await expect(ContactImportBatch.create({})).rejects.toThrow();
    await expect(ContactImportBatch.create({ workspaceId })).rejects.toThrow();
  });

  it("defaults status=PENDING and every row counter to 0", async () => {
    const batch = await ContactImportBatch.create({ workspaceId, fileName: "contacts.csv" });
    expect(batch.status).toBe("PENDING");
    expect(batch.totalRows).toBe(0);
    expect(batch.importedRows).toBe(0);
    expect(batch.skippedRows).toBe(0);
    expect(batch.duplicateRows).toBe(0);
    expect(batch.failedRows).toBe(0);
  });

  it("rejects an invalid status", async () => {
    await expect(ContactImportBatch.create({ workspaceId, fileName: "bad.csv", status: "NOT_A_STATUS" })).rejects.toThrow();
  });

  it("accepts every documented status", async () => {
    const statuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
    for (const status of statuses) {
      await expect(ContactImportBatch.create({ workspaceId, fileName: `${status}.csv`, status })).resolves.toBeTruthy();
    }
  });
});
