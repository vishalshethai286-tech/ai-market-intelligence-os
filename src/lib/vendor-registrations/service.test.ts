import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  listVendorRegistrations,
  getVendorRegistration,
  updateVendorRegistrationStatus,
  countVendorRegistrationsForRun,
  countVendorRegistrations,
  getVendorRegistrationDashboardStats,
  VendorRegistrationNotFoundError,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-vendor-registrations-service-";

function baseRegistrationFields(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    rawSearchResultId: "raw-1",
    discoveryRunId: "run-1",
    status: "NEW",
    duplicateStatus: "UNIQUE",
    ...overrides,
  };
}

describe("vendor registration service", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Vendor Registration Service" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Vendor Registration Service Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Vendor Registration Service Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    await VendorRegistration.create([
      baseRegistrationFields(workspaceId, { customerName: "ADNOC", country: "United Arab Emirates", status: "NEW", registrationType: "Supplier Portal", discoveryRunId: "run-a" }),
      baseRegistrationFields(workspaceId, { customerName: "SABIC", country: "Saudi Arabia", status: "APPROVED", registrationType: "Vendor Onboarding", discoveryRunId: "run-b" }),
      baseRegistrationFields(workspaceId, { customerName: "Zephyr Petrochem", country: "Saudi Arabia", status: "REJECTED", duplicateStatus: "POSSIBLE_DUPLICATE", discoveryRunId: "run-b" }),
    ]);
    await VendorRegistration.create(baseRegistrationFields(otherWorkspaceId, { customerName: "Other Workspace Vendor", country: "USA" }));
  });

  afterAll(async () => {
    await VendorRegistration.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("lists all vendor registrations for the workspace, excluding other workspaces", async () => {
    const result = await listVendorRegistrations(workspaceId);
    expect(result.total).toBe(3);
    expect(result.registrations.every((r) => r.workspaceId === workspaceId)).toBe(true);
  });

  it("filters by country", async () => {
    const result = await listVendorRegistrations(workspaceId, { country: "Saudi Arabia" });
    expect(result.total).toBe(2);
  });

  it("filters by status", async () => {
    const result = await listVendorRegistrations(workspaceId, { status: "APPROVED" });
    expect(result.total).toBe(1);
    expect(result.registrations[0].customerName).toBe("SABIC");
  });

  it("filters by duplicateStatus", async () => {
    const result = await listVendorRegistrations(workspaceId, { duplicateStatus: "POSSIBLE_DUPLICATE" });
    expect(result.total).toBe(1);
    expect(result.registrations[0].customerName).toBe("Zephyr Petrochem");
  });

  it("filters by registrationType", async () => {
    const result = await listVendorRegistrations(workspaceId, { registrationType: "Vendor Onboarding" });
    expect(result.total).toBe(1);
    expect(result.registrations[0].customerName).toBe("SABIC");
  });

  it("searches by customer name (case-insensitive substring)", async () => {
    const result = await listVendorRegistrations(workspaceId, { q: "adnoc" });
    expect(result.total).toBe(1);
    expect(result.registrations[0].customerName).toBe("ADNOC");
  });

  it("paginates results", async () => {
    const result = await listVendorRegistrations(workspaceId, { pageSize: 2, page: 1 });
    expect(result.registrations.length).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it("gets a single vendor registration by id, scoped to the workspace", async () => {
    const created = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Delta Chemicals" }));
    const found = await getVendorRegistration(workspaceId, created.id);
    expect(found.customerName).toBe("Delta Chemicals");
  });

  it("throws VendorRegistrationNotFoundError for an id from another workspace", async () => {
    const otherRegistration = await VendorRegistration.findOne({ workspaceId: otherWorkspaceId });
    await expect(getVendorRegistration(workspaceId, otherRegistration!.id)).rejects.toThrow(VendorRegistrationNotFoundError);
  });

  it("updates a vendor registration's status", async () => {
    const created = await VendorRegistration.create(baseRegistrationFields(workspaceId, { customerName: "Epsilon Energy", status: "NEW" }));
    const updated = await updateVendorRegistrationStatus(workspaceId, created.id, "IN_PROGRESS");
    expect(updated.status).toBe("IN_PROGRESS");

    const persisted = await VendorRegistration.findById(created.id);
    expect(persisted?.status).toBe("IN_PROGRESS");
  });

  it("counts vendor registrations for a discovery run", async () => {
    const count = await countVendorRegistrationsForRun(workspaceId, "run-b");
    expect(count).toBe(2);
  });

  it("counts total vendor registrations for a workspace, excluding other workspaces", async () => {
    const count = await countVendorRegistrations(workspaceId);
    const otherCount = await countVendorRegistrations(otherWorkspaceId);
    expect(count).toBeGreaterThanOrEqual(3);
    expect(otherCount).toBe(1);
  });

  it("computes dashboard stats (totals, by-status, by-country, approved/submitted)", async () => {
    const stats = await getVendorRegistrationDashboardStats(workspaceId);
    expect(stats.total).toBeGreaterThanOrEqual(3);
    expect(stats.approved).toBeGreaterThanOrEqual(1);
    expect(stats.byStatus.APPROVED).toBeGreaterThanOrEqual(1);
    expect(stats.byCountry.some((c) => c.country === "Saudi Arabia")).toBe(true);
  });
});
