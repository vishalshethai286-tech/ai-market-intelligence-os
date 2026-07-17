import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact, ContactTask, ContactEmailTemplate, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  getContactsExportRows,
  CONTACT_EXPORT_COLUMNS,
  getContactTasksExportRows,
  CONTACT_TASK_EXPORT_COLUMNS,
  getContactEnrichmentReportExportRows,
  CONTACT_ENRICHMENT_REPORT_EXPORT_COLUMNS,
  getMissingContactCoverageExportRows,
  MISSING_CONTACT_COVERAGE_EXPORT_COLUMNS,
  getContactEmailTemplatesExportRows,
  CONTACT_EMAIL_TEMPLATE_EXPORT_COLUMNS,
} = await import("./service");
const { toCsv } = await import("./csv");

await dbConnect();

const TEST_PREFIX = "vitest-export-service-";

describe("getContactsExportRows", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Export Service Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Export Service Co", userId);
    workspaceId = workspace.id;

    await Contact.create({
      workspaceId,
      fullName: "Export Manual Contact",
      sourceType: "MANUAL_ENTRY",
      sourceHistory: [],
      confidenceScore: 0.9,
      status: "NEW",
    });
    await Contact.create({
      workspaceId,
      fullName: "Export Public Contact",
      sourceType: "PROCUREMENT_PAGE",
      sourceUrl: "https://example.com/procurement",
      sourceHistory: [{ url: "https://example.com/procurement", sourceType: "PROCUREMENT_PAGE", retrievedAt: new Date() }],
      confidenceScore: 0.6,
      status: "NEW",
    });
  });

  afterAll(async () => {
    await Contact.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("includes an isPubliclyDiscovered indicator distinguishing manual entries from publicly-discovered contacts", async () => {
    const rows = await getContactsExportRows(workspaceId);
    expect(CONTACT_EXPORT_COLUMNS).toContain("isPubliclyDiscovered");
    expect(CONTACT_EXPORT_COLUMNS).toContain("sourceUrl");
    expect(CONTACT_EXPORT_COLUMNS).toContain("sourceHistoryUrls");
    expect(CONTACT_EXPORT_COLUMNS).toContain("relatedRecordIds");

    const manual = rows.find((r) => r.fullName === "Export Manual Contact");
    const publicContact = rows.find((r) => r.fullName === "Export Public Contact");
    expect(manual?.isPubliclyDiscovered).toBe(false);
    expect(publicContact?.isPubliclyDiscovered).toBe(true);
    expect(publicContact?.sourceHistoryUrls).toContain("https://example.com/procurement");
  });

  it("includes enrichment/CRM fields and is properly CSV-escaped", async () => {
    const rows = await getContactsExportRows(workspaceId);
    for (const column of ["enrichmentStatus", "enrichmentScore", "missingFields", "recommendedAction", "bestContactFor", "doNotContact", "ownerUserId", "assignedToUserId", "openTaskCount"]) {
      expect(CONTACT_EXPORT_COLUMNS).toContain(column);
    }
    const csv = toCsv(rows, CONTACT_EXPORT_COLUMNS);
    expect(csv).toContain("Export Manual Contact");
  });
});

describe("getContactTasksExportRows", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}tasks-${Date.now()}@example.com`, name: "Export Tasks Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Export Tasks Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Export Tasks Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const contact = await Contact.create({ workspaceId, fullName: "Export Task Contact", sourceHistory: [] });
    await ContactTask.create({ workspaceId, contactId: contact.id, title: 'Call re: "pricing", urgent', taskType: "CALL" });
    await ContactTask.create({ workspaceId: otherWorkspaceId, title: "Other workspace task", taskType: "CALL" });
  });

  afterAll(async () => {
    await ContactTask.deleteMany({ workspaceId });
    await Contact.deleteMany({ workspaceId });
    await ContactTask.deleteMany({ workspaceId: otherWorkspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await Workspace.deleteOne({ _id: otherWorkspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("exports only this workspace's contact tasks, with quote-escaped titles surviving a CSV round-trip", async () => {
    const rows = await getContactTasksExportRows(workspaceId);
    expect(rows.some((r) => r.title.includes("pricing"))).toBe(true);
    expect(rows.some((r) => r.title === "Other workspace task")).toBe(false);

    const csv = toCsv(rows, CONTACT_TASK_EXPORT_COLUMNS);
    expect(csv).toContain('"Call re: ""pricing"", urgent"');
  });
});

describe("getContactEnrichmentReportExportRows / getMissingContactCoverageExportRows / getContactEmailTemplatesExportRows", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}reports-${Date.now()}@example.com`, name: "Export Reports Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Export Reports Co", userId);
    workspaceId = workspace.id;

    await Contact.create({ workspaceId, fullName: "Enrichment Report Contact", enrichmentScore: 80, sourceHistory: [] });
    await TargetCustomer.create({
      workspaceId,
      customerName: "Coverage Gap Customer",
      status: "APPROVED",
      sourceHistory: [],
      rawSearchResultId: "raw-coverage-gap",
      discoveryRunId: "run-coverage-gap",
    });
  });

  afterAll(async () => {
    await Promise.all([
      Contact.deleteMany({ workspaceId }),
      TargetCustomer.deleteMany({ workspaceId }),
      ContactEmailTemplate.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("exports a single-row contact enrichment report", async () => {
    const rows = await getContactEnrichmentReportExportRows(workspaceId);
    expect(rows.length).toBe(1);
    expect(CONTACT_ENRICHMENT_REPORT_EXPORT_COLUMNS).toContain("averageEnrichmentScore");
    const csv = toCsv(rows, CONTACT_ENRICHMENT_REPORT_EXPORT_COLUMNS);
    expect(csv.split("\r\n").length).toBeGreaterThanOrEqual(2);
  });

  it("exports one row per entity missing a contact", async () => {
    const rows = await getMissingContactCoverageExportRows(workspaceId);
    expect(rows.some((r) => r.name === "Coverage Gap Customer")).toBe(true);
    expect(MISSING_CONTACT_COVERAGE_EXPORT_COLUMNS).toEqual(["recordType", "recordId", "name"]);
  });

  it("exports email templates including seeded defaults", async () => {
    await ContactEmailTemplate.create({ workspaceId, name: "Custom Export Template", templateType: "CUSTOM", subject: "s", body: "b", isDefault: false });
    const rows = await getContactEmailTemplatesExportRows(workspaceId);
    expect(rows.some((r) => r.name === "Custom Export Template")).toBe(true);
    expect(CONTACT_EMAIL_TEMPLATE_EXPORT_COLUMNS).toContain("isDefault");
  });
});
