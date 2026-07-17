import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { createContact } = await import("@/lib/contacts/service");
const ContactsPage = (await import("./page")).default;
const ContactDetailPage = (await import("./[id]/page")).default;
const NewContactPage = (await import("./new/page")).default;
const EditContactPage = (await import("./[id]/edit/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-contacts-pages-";

describe("Contacts pages render", () => {
  let userId: string;
  let workspaceId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await Contact.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Contacts page renders the empty state with no contacts yet", async () => {
    const element = (await ContactsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Contacts page renders with data and every filter applied", async () => {
    const { contact } = await createContact(workspaceId, {
      fullName: "Filter Test Contact",
      companyName: "Filter Test Co",
      designation: "Procurement Manager",
      country: "USA",
      email: "filter-test@example.com",
    });
    contactId = contact.id;

    const element = (await ContactsPage({
      searchParams: Promise.resolve({
        q: "Filter Test",
        roleCategory: "PROCUREMENT",
        department: "",
        seniority: "MANAGER",
        country: "USA",
        priority: contact.priority ?? undefined,
        status: "NEW",
        sourceType: "MANUAL_ENTRY",
        duplicateStatus: "UNIQUE",
      }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Contact detail page renders for an existing contact", async () => {
    const element = (await ContactDetailPage({ params: Promise.resolve({ id: contactId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("New Contact page renders", async () => {
    const element = (await NewContactPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("New Contact page renders with a pre-link record type/id in the query string", async () => {
    const element = (await NewContactPage({
      searchParams: Promise.resolve({ relatedRecordType: "TARGET_CUSTOMER", relatedRecordId: "some-id" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Edit Contact page renders for an existing contact", async () => {
    const element = (await EditContactPage({ params: Promise.resolve({ id: contactId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
