import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration, DiscoveryRun } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const VendorRegistrationsPage = (await import("./page")).default;
const VendorRegistrationDetailPage = (await import("./[id]/page")).default;
const DiscoveryRunDetailPage = (await import("@/app/dashboard/discovery-runs/[id]/page")).default;
const RawSearchResultsPage = (await import("@/app/dashboard/raw-search-results/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-vendor-registrations-pages-";

describe("Vendor Registrations pages render", () => {
  let userId: string;
  let workspaceId: string;
  let registrationId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Vendor Registration Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await VendorRegistration.deleteMany({ workspaceId });
    await DiscoveryRun.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Vendor Registrations page renders the empty state with no registrations yet", async () => {
    const element = (await VendorRegistrationsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Vendor Registrations page renders with data and filters applied", async () => {
    const registration = await VendorRegistration.create({
      workspaceId,
      customerName: "Filter Test Vendor",
      country: "United Arab Emirates",
      registrationType: "Supplier Portal",
      status: "APPROVED",
      duplicateStatus: "UNIQUE",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    registrationId = registration.id;

    const element = (await VendorRegistrationsPage({
      searchParams: Promise.resolve({ country: "United Arab Emirates", status: "APPROVED", duplicateStatus: "UNIQUE", registrationType: "Supplier Portal" }),
    })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Vendor Registration detail page renders for an existing registration", async () => {
    const element = (await VendorRegistrationDetailPage({ params: Promise.resolve({ id: registrationId }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Discovery Run detail page renders with the Process Vendor Registration Results button available", async () => {
    const run = await DiscoveryRun.create({
      workspaceId,
      discoveryBrainId: "brain-1",
      runType: "MANUAL",
      status: "COMPLETED",
      searchType: "VENDOR_REGISTRATION",
      queriesExecuted: 1,
      rawResultsFound: 1,
    });

    const element = (await DiscoveryRunDetailPage({ params: Promise.resolve({ id: run.id }) })) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Raw Search Results page renders with the vendor_registration filter applied", async () => {
    const element = (await RawSearchResultsPage({ searchParams: Promise.resolve({ searchType: "VENDOR_REGISTRATION" }) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
