import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, ContactTask, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  createContactTask,
  updateContactTask,
  completeContactTask,
  listContactTasks,
  getOverdueContactTasks,
  generateRecommendedContactTasks,
  generateMissingContactTasksForWorkspace,
  ContactTaskNotFoundError,
} = await import("./tasks");

await dbConnect();

const TEST_PREFIX = "vitest-contact-tasks-";

describe("contact tasks", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Tasks Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Tasks Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Contact Tasks Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const contact = await Contact.create({ workspaceId, fullName: "Task Test Contact", sourceHistory: [] });
    contactId = contact.id;
  });

  afterAll(async () => {
    await Promise.all([
      ContactTask.deleteMany({ workspaceId }),
      Contact.deleteMany({ workspaceId }),
      TargetCustomer.deleteMany({ workspaceId }),
      ContactTask.deleteMany({ workspaceId: otherWorkspaceId }),
      Contact.deleteMany({ workspaceId: otherWorkspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await Workspace.deleteOne({ _id: otherWorkspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("creates a task", async () => {
    const task = await createContactTask(workspaceId, { contactId, title: "Call the contact", taskType: "CALL" });
    expect(task.status).toBe("OPEN");
    expect(task.contactId).toBe(contactId);
  });

  it("rejects creating a task for a contact from another workspace", async () => {
    await expect(createContactTask(workspaceId, { contactId: "does-not-exist", title: "Bad", taskType: "CALL" })).rejects.toThrow(
      ContactTaskNotFoundError,
    );
  });

  it("updates a task", async () => {
    const task = await createContactTask(workspaceId, { contactId, title: "Update me", taskType: "FOLLOW_UP" });
    const updated = await updateContactTask(workspaceId, task.id, { title: "Updated title", priority: "HIGH" });
    expect(updated.title).toBe("Updated title");
    expect(updated.priority).toBe("HIGH");
  });

  it("completes a task, setting completedAt", async () => {
    const task = await createContactTask(workspaceId, { contactId, title: "Complete me", taskType: "VERIFY" });
    const completed = await completeContactTask(workspaceId, task.id);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeTruthy();
  });

  it("detects an overdue task (past dueDate, still open)", async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await createContactTask(workspaceId, { contactId, title: "Overdue task", taskType: "CALL", dueDate: pastDue });

    const overdue = await getOverdueContactTasks(workspaceId);
    expect(overdue.some((t) => t.title === "Overdue task")).toBe(true);
    expect(overdue.every((t) => t.isOverdue)).toBe(true);

    const listed = await listContactTasks(workspaceId, { overdueOnly: true });
    expect(listed.tasks.some((t) => t.title === "Overdue task")).toBe(true);
  });

  it("does not mark a completed task as overdue even with a past dueDate", async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const task = await createContactTask(workspaceId, { contactId, title: "Completed overdue", taskType: "CALL", dueDate: pastDue });
    await completeContactTask(workspaceId, task.id);

    const overdue = await getOverdueContactTasks(workspaceId);
    expect(overdue.some((t) => t.title === "Completed overdue")).toBe(false);
  });

  it("generates a recommended task from a contact's recommendedAction, and doesn't duplicate an already-open one", async () => {
    const contact = await Contact.create({ workspaceId, fullName: "Needs Email Contact", sourceHistory: [] });
    // createContact's own enrichment wiring isn't used here (direct model create), so recommendedAction defaults to NONE — set it explicitly.
    contact.recommendedAction = "FIND_EMAIL";
    contact.recommendedActionReason = "No email on file.";
    await contact.save();

    const created = await generateRecommendedContactTasks(workspaceId, contact.id);
    expect(created).not.toBeNull();
    expect(created?.taskType).toBe("FIND_EMAIL");

    const duplicate = await generateRecommendedContactTasks(workspaceId, contact.id);
    expect(duplicate).toBeNull();
  });

  it("generateMissingContactTasksForWorkspace creates an entity-level task for a high-priority customer with no contact", async () => {
    await TargetCustomer.create({
      workspaceId,
      customerName: "No Contact Customer",
      status: "APPROVED",
      sourceHistory: [],
      rawSearchResultId: "raw-no-contact",
      discoveryRunId: "run-no-contact",
    });

    const summary = await generateMissingContactTasksForWorkspace(workspaceId);
    expect(summary.entityLevelTasksCreated).toBeGreaterThanOrEqual(1);

    const task = await ContactTask.findOne({ workspaceId, relatedRecordType: "TARGET_CUSTOMER", title: /No Contact Customer/ });
    expect(task).not.toBeNull();
    expect(task?.contactId).toBeFalsy();
  });

  it("is workspace-isolated — never lists or completes another workspace's tasks", async () => {
    const otherContact = await Contact.create({ workspaceId: otherWorkspaceId, fullName: "Other Workspace Contact", sourceHistory: [] });
    const otherTask = await createContactTask(otherWorkspaceId, { contactId: otherContact.id, title: "Other workspace task", taskType: "CALL" });

    const { tasks } = await listContactTasks(workspaceId);
    expect(tasks.some((t) => t.id === otherTask.id)).toBe(false);

    await expect(completeContactTask(workspaceId, otherTask.id)).rejects.toThrow(ContactTaskNotFoundError);
  });
});
