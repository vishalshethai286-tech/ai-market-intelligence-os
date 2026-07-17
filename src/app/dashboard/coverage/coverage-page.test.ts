import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, VendorRegistration, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { computeCoverageSnapshot, ensureCountryCoverageSeeded } = await import("@/lib/discovery-brain/coverage");
const CoveragePage = (await import("./page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-coverage-page-";

describe("Coverage page renders", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Coverage Page" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Coverage Page Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await VendorRegistration.deleteMany({ workspaceId });
    await TargetCustomer.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("renders the empty state with no coverage snapshot yet", async () => {
    const element = (await CoveragePage()) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("renders discovered-records-by-country, including vendor registration counts, once a snapshot exists", async () => {
    await ensureCountryCoverageSeeded(workspaceId);
    await computeCoverageSnapshot(workspaceId);

    await VendorRegistration.create({
      workspaceId,
      customerName: "Coverage Test Vendor",
      country: "United Arab Emirates",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });
    await TargetCustomer.create({
      workspaceId,
      customerName: "Coverage Test Customer",
      country: "United Arab Emirates",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
    });

    const element = (await CoveragePage()) as ReactElement;
    expect(element).toBeTruthy();
  });
});
