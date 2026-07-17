import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// These pages call requireActiveWorkspace(), which needs auth()/cookies() —
// mocked the same way as every other server-side test in this codebase
// (see src/lib/workspace.test.ts) so the page functions can run directly
// without a live Next.js request.
const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const DiscoveryRunsPage = (await import("@/app/dashboard/discovery-runs/page")).default;
const RawSearchResultsPage = (await import("@/app/dashboard/raw-search-results/page")).default;

await dbConnect();

const TEST_PREFIX = "vitest-discovery-ui-pages-";

describe("Discovery Brain sub-pages load", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "UI Pages" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("UI Pages Co", userId);
    workspaceId = workspace.id;

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("Discovery Runs page renders without throwing when there are no runs yet", async () => {
    const element = (await DiscoveryRunsPage()) as ReactElement;
    expect(element).toBeTruthy();
  });

  it("Raw Search Results page renders without throwing when there are no results yet", async () => {
    const element = (await RawSearchResultsPage({ searchParams: Promise.resolve({}) })) as ReactElement;
    expect(element).toBeTruthy();
  });
});
