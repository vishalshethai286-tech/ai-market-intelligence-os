import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { detectExistingContact, calculateContactDuplicateScore, updateExistingContactWithBetterData, preserveContactSourceHistory } = await import("./duplicate");

await dbConnect();

const TEST_PREFIX = "vitest-contacts-duplicate-";

describe("detectExistingContact", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Duplicate" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Duplicate Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Duplicate Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Contact.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("detects a STRONG match on the same email", async () => {
    await Contact.create({ workspaceId, fullName: "Jane Doe", email: "jane.duplicate-test@acme.example" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "Jane D.",
      email: "Jane.Duplicate-Test@Acme.example",
      linkedinUrl: "",
      companyDomain: "",
      companyName: "",
      country: "",
      phoneNumber: "",
    });
    expect(match?.matchType).toBe("STRONG");
  });

  it("detects a STRONG match on the same LinkedIn URL", async () => {
    await Contact.create({ workspaceId, fullName: "John Smith", linkedinUrl: "https://linkedin.com/in/john-smith-duplicate-test" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "J. Smith",
      email: "",
      linkedinUrl: "https://www.linkedin.com/in/john-smith-duplicate-test/",
      companyDomain: "",
      companyName: "",
      country: "",
      phoneNumber: "",
    });
    expect(match?.matchType).toBe("STRONG");
  });

  it("detects a STRONG match on the same fullName + companyDomain", async () => {
    await Contact.create({ workspaceId, fullName: "Alice Procurement", companyDomain: "widgetco-duplicate-test.example" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "Alice Procurement",
      email: "",
      linkedinUrl: "",
      companyDomain: "widgetco-duplicate-test.example",
      companyName: "",
      country: "",
      phoneNumber: "",
    });
    expect(match?.matchType).toBe("STRONG");
  });

  it("detects a WEAK match on the same phoneNumber + companyDomain", async () => {
    await Contact.create({ workspaceId, fullName: "Bob Sourcing", phoneNumber: "+1 555 200 3000", companyDomain: "phoneco-duplicate-test.example" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "Robert Sourcing",
      email: "",
      linkedinUrl: "",
      companyDomain: "phoneco-duplicate-test.example",
      companyName: "",
      country: "",
      phoneNumber: "+1 (555) 200-3000",
    });
    expect(match?.matchType).toBe("WEAK");
  });

  it("detects a WEAK match on the same fullName + companyName + country", async () => {
    await Contact.create({ workspaceId, fullName: "Carol Contracts", companyName: "Contracts Co Duplicate Test", country: "India" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "Carol Contracts",
      email: "",
      linkedinUrl: "",
      companyDomain: "",
      companyName: "Contracts Co Duplicate Test",
      country: "India",
      phoneNumber: "",
    });
    expect(match?.matchType).toBe("WEAK");
  });

  it("does not treat a contact in a different workspace as a duplicate", async () => {
    await Contact.create({ workspaceId: otherWorkspaceId, fullName: "Cross Workspace Contact", email: "cross-ws-duplicate-test@example.com" });
    const match = await detectExistingContact(workspaceId, {
      fullName: "Cross Workspace Contact",
      email: "cross-ws-duplicate-test@example.com",
      linkedinUrl: "",
      companyDomain: "",
      companyName: "",
      country: "",
      phoneNumber: "",
    });
    expect(match).toBeNull();
  });

  it("returns null when nothing matches", async () => {
    const match = await detectExistingContact(workspaceId, {
      fullName: "Nobody Matching",
      email: "nobody-matching-duplicate-test@example.com",
      linkedinUrl: "",
      companyDomain: "",
      companyName: "",
      country: "",
      phoneNumber: "",
    });
    expect(match).toBeNull();
  });
});

describe("calculateContactDuplicateScore", () => {
  const base = {
    fullName: "Jane Doe",
    companyName: "Acme Corp",
    companyDomain: "acme.com",
    country: "USA",
    email: "jane@acme.com",
    linkedinUrl: "https://linkedin.com/in/jane-doe",
    phoneNumber: "+1 555 123 4567",
  };

  it("scores same email as a high-confidence match, even with nothing else matching", () => {
    const other = { ...base, fullName: "Different Name", companyName: "Different Co", companyDomain: "different.com", country: "India", linkedinUrl: "", phoneNumber: "" };
    const result = calculateContactDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.matchingFields).toContain("email");
  });

  it("scores same LinkedIn URL as a high-confidence match", () => {
    const other = { ...base, fullName: "Different Name", email: "", companyDomain: "different.com" };
    const result = calculateContactDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.matchingFields).toContain("linkedinUrl");
  });

  it("scores two unrelated contacts low", () => {
    const other = {
      fullName: "Zephyr Unrelated",
      companyName: "Zephyr Co",
      companyDomain: "zephyr.example",
      country: "Germany",
      email: "zephyr@zephyr.example",
      linkedinUrl: "https://linkedin.com/in/zephyr-unrelated",
      phoneNumber: "+49 30 1234567",
    };
    const result = calculateContactDuplicateScore(base, other);
    expect(result.score).toBeLessThan(75);
  });
});

describe("updateExistingContactWithBetterData", () => {
  it("fills empty fields from incoming data without overwriting existing values", () => {
    const values: Record<string, unknown> = { email: null, phoneNumber: "+1 555 000 0000", companyName: "Existing Co" };
    const fakeDoc = {
      get: (field: string) => values[field],
      set: (field: string, value: unknown) => {
        values[field] = value;
      },
    };
    const updatedFields = updateExistingContactWithBetterData(fakeDoc, { email: "new@example.com", phoneNumber: "+1 555 999 9999", companyName: "Incoming Co" });
    expect(updatedFields).toEqual(["email"]);
    expect(values.email).toBe("new@example.com");
    expect(values.phoneNumber).toBe("+1 555 000 0000");
    expect(values.companyName).toBe("Existing Co");
  });
});

describe("preserveContactSourceHistory", () => {
  it("appends a new source history entry", () => {
    const existing = [{ url: "https://a.example", sourceType: "COMPANY_WEBSITE" as const, note: null, retrievedAt: new Date() }];
    const result = preserveContactSourceHistory(existing, { url: "https://b.example", sourceType: "CONTACT_PAGE", note: null, retrievedAt: new Date() });
    expect(result.length).toBe(2);
  });

  it("skips an exact duplicate (same url + sourceType)", () => {
    const entry = { url: "https://a.example", sourceType: "COMPANY_WEBSITE" as const, note: null, retrievedAt: new Date() };
    const result = preserveContactSourceHistory([entry], { ...entry, retrievedAt: new Date() });
    expect(result.length).toBe(1);
  });
});
