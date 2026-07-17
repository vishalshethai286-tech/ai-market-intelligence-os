import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const {
  createContactAction,
  updateContactAction,
  changeContactStatusAction,
  addContactActivityAction,
  linkContactAction,
  deleteOrArchiveContactAction,
} = await import("./contacts");

await dbConnect();

const TEST_PREFIX = "vitest-contact-actions-";

function formDataFor(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function baseContactFormFields(overrides: Record<string, string> = {}) {
  return {
    fullName: "Action Test Contact",
    companyName: "",
    companyWebsite: "",
    designation: "",
    department: "",
    roleCategory: "",
    seniority: "",
    email: "",
    phoneNumber: "",
    mobileNumber: "",
    linkedinUrl: "",
    country: "",
    location: "",
    status: "NEW",
    notes: "",
    tags: "",
    sourceUrl: "",
    sourceType: "MANUAL_ENTRY",
    ...overrides,
  };
}

describe("contact actions", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Actions" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Actions Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await Promise.all([Contact.deleteMany({ workspaceId }), TargetCustomer.deleteMany({ workspaceId })]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  it("createContactAction creates a contact from form data", async () => {
    const result = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Create Action Contact", designation: "Procurement Manager" })));
    expect(result?.contactId).toBeTruthy();
    expect(result?.errors).toBeUndefined();

    const created = await Contact.findById(result?.contactId);
    expect(created?.fullName).toBe("Create Action Contact");
    expect(created?.roleCategory).toBe("PROCUREMENT");
  });

  it("createContactAction returns field errors for a missing fullName", async () => {
    const result = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "" })));
    expect(result?.errors?.fullName).toBeTruthy();
  });

  it("updateContactAction updates an existing contact", async () => {
    const createResult = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Update Action Contact" })));
    const id = createResult?.contactId as string;

    const updateResult = await updateContactAction(
      undefined,
      formDataFor({ ...baseContactFormFields({ fullName: "Updated Name" }), contactId: id }),
    );
    expect(updateResult?.errors).toBeUndefined();

    const updated = await Contact.findById(id);
    expect(updated?.fullName).toBe("Updated Name");
  });

  it("changeContactStatusAction updates status", async () => {
    const createResult = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Status Action Contact" })));
    const id = createResult?.contactId as string;

    const result = await changeContactStatusAction(id, "CONTACTED");
    expect(result.ok).toBe(true);

    const updated = await Contact.findById(id);
    expect(updated?.status).toBe("CONTACTED");
  });

  it("addContactActivityAction logs an activity", async () => {
    const createResult = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Activity Action Contact" })));
    const id = createResult?.contactId as string;

    const result = await addContactActivityAction(id, { activityType: "NOTE", description: "Test note" });
    expect(result.ok).toBe(true);
  });

  it("linkContactAction links a contact to a TargetCustomer", async () => {
    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "Link Action Customer",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const createResult = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Link Action Contact" })));
    const id = createResult?.contactId as string;

    const result = await linkContactAction(id, "TARGET_CUSTOMER", customer.id);
    expect(result.ok).toBe(true);

    const updated = await Contact.findById(id);
    expect(updated?.relatedTargetCustomerId).toBe(customer.id);
  });

  it("deleteOrArchiveContactAction archives the contact", async () => {
    const createResult = await createContactAction(undefined, formDataFor(baseContactFormFields({ fullName: "Archive Action Contact" })));
    const id = createResult?.contactId as string;

    const result = await deleteOrArchiveContactAction(id);
    expect(result.ok).toBe(true);

    const updated = await Contact.findById(id);
    expect(updated?.status).toBe("ARCHIVED");
  });
});
