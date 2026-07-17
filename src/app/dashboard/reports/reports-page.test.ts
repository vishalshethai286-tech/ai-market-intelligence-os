import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, TargetCustomer, VendorRegistration, Contact } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const ReportsPage = (await import("./page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-reports-page-";

describe("Reports page renders", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Reports Page" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Reports Page Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await TargetCustomer.deleteMany({ workspaceId });
    await VendorRegistration.deleteMany({ workspaceId });
    await Contact.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("renders with no data yet", async () => {
    const element = (await ReportsPage()) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders with data across every report section", async () => {
    await TargetCustomer.create({
      workspaceId,
      customerName: "Reports Page Customer",
      country: "USA",
      matchedProductServiceName: "Centrifugal Pump",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    await VendorRegistration.create({
      workspaceId,
      customerName: "Reports Page Vendor",
      country: "India",
      status: "APPROVED",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await Contact.create({
      workspaceId,
      fullName: "Reports Page Contact",
      country: "USA",
      email: "reports-page-contact@example.com",
      linkedinUrl: "https://linkedin.com/in/reports-page-contact",
      roleCategory: "PROCUREMENT",
      sourceType: "COMPANY_WEBSITE",
      status: "NEW",
    });

    const element = (await ReportsPage()) as ReactElement;
    expect(element).toBeTruthy();
  });
});
