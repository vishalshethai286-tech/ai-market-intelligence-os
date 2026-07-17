import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ContactEmailTemplate } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");

await dbConnect();

const TEST_PREFIX = "vitest-contact-email-template-model-";

describe("ContactEmailTemplate model", () => {
  let userId: string;
  let workspaceId: string;

  afterAll(async () => {
    await ContactEmailTemplate.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("creates with only the required fields, defaulting isDefault to false", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Email Template Model Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Email Template Model Co", userId);
    workspaceId = workspace.id;

    const template = await ContactEmailTemplate.create({
      workspaceId,
      name: "Custom template",
      templateType: "CUSTOM",
      subject: "Hello {{contactName}}",
      body: "Hi {{contactName}}, ...",
    });

    expect(template.isDefault).toBe(false);
    expect(template.productServiceContext).toBeFalsy();
  });

  it("requires workspaceId, name, templateType, subject, and body", async () => {
    await expect(ContactEmailTemplate.create({ workspaceId, templateType: "CUSTOM", subject: "s", body: "b" })).rejects.toThrow();
    await expect(ContactEmailTemplate.create({ workspaceId, name: "No type", subject: "s", body: "b" })).rejects.toThrow();
    await expect(ContactEmailTemplate.create({ workspaceId, name: "No subject", templateType: "CUSTOM", body: "b" })).rejects.toThrow();
    await expect(ContactEmailTemplate.create({ workspaceId, name: "No body", templateType: "CUSTOM", subject: "s" })).rejects.toThrow();
  });

  it("rejects an invalid templateType", async () => {
    await expect(
      ContactEmailTemplate.create({ workspaceId, name: "Bad type", templateType: "NOT_A_TYPE", subject: "s", body: "b" }),
    ).rejects.toThrow();
  });

  it("accepts every documented templateType value", async () => {
    const types = [
      "INTRODUCTION",
      "VENDOR_REGISTRATION",
      "TENDER_FOLLOW_UP",
      "PROJECT_OPPORTUNITY",
      "PRODUCT_INTRODUCTION",
      "CAPABILITY_STATEMENT",
      "MEETING_REQUEST",
      "FOLLOW_UP",
      "CUSTOM",
    ];
    for (const templateType of types) {
      await expect(
        ContactEmailTemplate.create({ workspaceId, name: `Template ${templateType}`, templateType, subject: "s", body: "b" }),
      ).resolves.toBeTruthy();
    }
  });
});
