import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, ProjectOpportunity, TenderBuyer, TenderOpportunity, VendorRegistration, DuplicateRecord } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const DuplicatesPage = (await import("./page")).default;
const DashboardPage = (await import("../page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-duplicates-page-";

describe("Duplicates page and dashboard duplicate metrics render", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Duplicates Page" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Duplicates Page Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId, name: "Duplicates Page", email: "duplicates-page@example.com" } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await TargetCustomer.deleteMany({ workspaceId });
    await ProjectOpportunity.deleteMany({ workspaceId });
    await TenderBuyer.deleteMany({ workspaceId });
    await TenderOpportunity.deleteMany({ workspaceId });
    await VendorRegistration.deleteMany({ workspaceId });
    await DuplicateRecord.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("renders the empty state with no duplicate records yet", async () => {
    const element = (await DuplicatesPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders with a pending duplicate record and filters applied", async () => {
    const a = await TargetCustomer.create({
      workspaceId,
      customerName: "Duplicate Page Co A",
      country: "USA",
      score: 60,
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    const b = await TargetCustomer.create({
      workspaceId,
      customerName: "Duplicate Page Co B",
      country: "USA",
      score: 55,
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "CUSTOMER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "Matches on customerName, country",
      matchingFields: ["customerName", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const element = (await DuplicatesPage({
      searchParams: Promise.resolve({ recordType: "CUSTOMER", status: "PENDING_REVIEW", minScore: "50" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders a project duplicate pair with project-specific filters applied (Phase 9)", async () => {
    const a = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Duplicate Page Project Co A",
      projectName: "Shared Refinery Project",
      country: "USA",
      score: 60,
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    const b = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Duplicate Page Project Co B",
      projectName: "Shared Refinery Project",
      country: "USA",
      score: 55,
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "PROJECT",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "Matches on projectName, country",
      matchingFields: ["projectName", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const element = (await DuplicatesPage({
      searchParams: Promise.resolve({ recordType: "PROJECT", status: "PENDING_REVIEW" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders a tender buyer duplicate pair with tender-buyer-specific filters applied (Phase 10)", async () => {
    const a = await TenderBuyer.create({
      workspaceId,
      customerName: "Duplicate Page Tender Buyer A",
      country: "Qatar",
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    const b = await TenderBuyer.create({
      workspaceId,
      customerName: "Duplicate Page Tender Buyer B",
      country: "Qatar",
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "TENDER_BUYER",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "Matches on customerName, country",
      matchingFields: ["customerName", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const element = (await DuplicatesPage({
      searchParams: Promise.resolve({ recordType: "TENDER_BUYER", status: "PENDING_REVIEW" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders a tender opportunity duplicate pair with tender-opportunity-specific filters applied (Phase 10)", async () => {
    const a = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Duplicate Page Tender Authority",
      tenderTitle: "Shared Structural Steel Tender",
      country: "USA",
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    const b = await TenderOpportunity.create({
      workspaceId,
      buyerOrganization: "Duplicate Page Tender Authority",
      tenderTitle: "Shared Structural Steel Tender",
      country: "USA",
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "TENDER_OPPORTUNITY",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "Matches on buyerOrganization, tenderTitle, country",
      matchingFields: ["buyerOrganization", "tenderTitle", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const element = (await DuplicatesPage({
      searchParams: Promise.resolve({ recordType: "TENDER_OPPORTUNITY", status: "PENDING_REVIEW" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders a vendor registration duplicate pair with vendor-registration-specific filters applied (Phase 11)", async () => {
    const a = await VendorRegistration.create({
      workspaceId,
      customerName: "Duplicate Page Vendor A",
      country: "United Arab Emirates",
      registrationType: "Supplier Portal",
      requiredDocuments: ["Company profile"],
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    const b = await VendorRegistration.create({
      workspaceId,
      customerName: "Duplicate Page Vendor B",
      country: "United Arab Emirates",
      registrationType: "Supplier Portal",
      requiredDocuments: ["Company profile"],
      status: "NEW",
      duplicateStatus: "POSSIBLE_DUPLICATE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await DuplicateRecord.create({
      workspaceId,
      recordType: "VENDOR_REGISTRATION",
      primaryRecordId: a.id,
      duplicateRecordId: b.id,
      duplicateScore: 80,
      duplicateReason: "Matches on customerName, country",
      matchingFields: ["customerName", "country"],
      conflictingFields: [],
      status: "PENDING_REVIEW",
    });

    const element = (await DuplicatesPage({
      searchParams: Promise.resolve({ recordType: "VENDOR_REGISTRATION", status: "PENDING_REVIEW" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Dashboard page renders duplicate metrics without throwing", async () => {
    const element = (await DashboardPage()) as ReactElement;
    expect(element).toBeTruthy();
  });
});
