import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, ContactTask } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-contact-task-model-";

describe("ContactTask model", () => {
  let userId: string;
  let workspaceId: string;
  let contactId: string;

  afterAll(async () => {
    await ContactTask.deleteMany({ workspaceId });
    await Contact.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("creates with only the required fields, applying sensible defaults", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Task Model Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Task Model Co", userId);
    workspaceId = workspace.id;
    const contact = await Contact.create({ workspaceId, fullName: "Task Model Contact", sourceHistory: [] });
    contactId = contact.id;

    const task = await ContactTask.create({ workspaceId, contactId, title: "Call the contact", taskType: "CALL" });

    expect(task.status).toBe("OPEN");
    expect(task.priority).toBe("MEDIUM");
    expect(task.dueDate).toBeFalsy();
    expect(task.completedAt).toBeFalsy();
  });

  it("allows a null contactId when relatedRecordType/relatedRecordId are set instead (entity-level task)", async () => {
    const task = await ContactTask.create({
      workspaceId,
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: "some-customer-id",
      title: "Find a contact for ABC Pumps",
      taskType: "FIND_EMAIL",
    });
    expect(task.contactId).toBeFalsy();
    expect(task.relatedRecordType).toBe("TARGET_CUSTOMER");
  });

  it("requires workspaceId, title, and taskType", async () => {
    await expect(ContactTask.create({ workspaceId, contactId, taskType: "CALL" })).rejects.toThrow();
    await expect(ContactTask.create({ contactId, title: "No workspace", taskType: "CALL" })).rejects.toThrow();
    await expect(ContactTask.create({ workspaceId, contactId, title: "No task type" })).rejects.toThrow();
  });

  it("rejects an invalid taskType/status/priority", async () => {
    await expect(ContactTask.create({ workspaceId, contactId, title: "Bad type", taskType: "NOT_A_TYPE" })).rejects.toThrow();
    await expect(ContactTask.create({ workspaceId, contactId, title: "Bad status", taskType: "CALL", status: "NOT_A_STATUS" })).rejects.toThrow();
    await expect(ContactTask.create({ workspaceId, contactId, title: "Bad priority", taskType: "CALL", priority: "NOT_A_PRIORITY" })).rejects.toThrow();
  });

  it("accepts every documented taskType/status/priority value", async () => {
    const taskTypes = ["CALL", "EMAIL", "FOLLOW_UP", "VERIFY", "FIND_EMAIL", "FIND_PHONE", "LINK_OPPORTUNITY", "REVIEW", "OTHER"];
    for (const taskType of taskTypes) {
      await expect(ContactTask.create({ workspaceId, contactId, title: `Type ${taskType}`, taskType })).resolves.toBeTruthy();
    }
    const statuses = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"];
    for (const status of statuses) {
      await expect(ContactTask.create({ workspaceId, contactId, title: `Status ${status}`, taskType: "OTHER", status })).resolves.toBeTruthy();
    }
    const priorities = ["HIGH", "MEDIUM", "LOW"];
    for (const priority of priorities) {
      await expect(ContactTask.create({ workspaceId, contactId, title: `Priority ${priority}`, taskType: "OTHER", priority })).resolves.toBeTruthy();
    }
  });
});
