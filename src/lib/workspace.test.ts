import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

// Imported after the mocks above so `workspace.ts` picks up the mocked
// `@/auth` / `next/headers` / `next/navigation` instead of the real ones,
// which require a live Next.js request context.
const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, WorkspaceMember } = await import("@/models");
const {
  createWorkspaceWithOwner,
  listMemberships,
  getWorkspaceContext,
  getActiveWorkspace,
  requireActiveWorkspace,
  ACTIVE_WORKSPACE_COOKIE,
} = await import("./workspace");

await dbConnect();

const TEST_PREFIX = "vitest-phase2-";

async function makeUser(localPart: string) {
  return User.create({ email: `${TEST_PREFIX}${localPart}@example.com`, name: localPart });
}

async function cleanupUser(userId: string) {
  const memberships = await WorkspaceMember.find({ userId });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length > 0) {
    await Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await WorkspaceMember.deleteMany({ workspaceId: { $in: workspaceIds } });
  }
  await User.deleteOne({ _id: userId });
}

describe("createWorkspaceWithOwner", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await makeUser("creation")).id;
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  it("creates a workspace and makes the caller its ACTIVE OWNER", async () => {
    const workspace = await createWorkspaceWithOwner("Vitest Creation Co", userId);
    expect(workspace.name).toBe("Vitest Creation Co");
    expect(workspace.slug).toBeTruthy();

    const membership = await WorkspaceMember.findOne({ workspaceId: workspace.id, userId });
    expect(membership).not.toBeNull();
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.joinedAt).not.toBeNull();
  });

  it("gives two workspaces created with the same name distinct slugs", async () => {
    const first = await createWorkspaceWithOwner("Duplicate Name Co", userId);
    const second = await createWorkspaceWithOwner("Duplicate Name Co", userId);
    expect(first.slug).not.toBe(second.slug);
  });
});

describe("user workspace isolation", () => {
  let userA: string;
  let userB: string;
  let workspaceA: Awaited<ReturnType<typeof createWorkspaceWithOwner>>;
  let workspaceB: Awaited<ReturnType<typeof createWorkspaceWithOwner>>;

  beforeAll(async () => {
    userA = (await makeUser("isolation-a")).id;
    userB = (await makeUser("isolation-b")).id;
    workspaceA = await createWorkspaceWithOwner("Isolation Workspace A", userA);
    workspaceB = await createWorkspaceWithOwner("Isolation Workspace B", userB);
  });

  afterAll(async () => {
    await cleanupUser(userA);
    await cleanupUser(userB);
  });

  it("listMemberships only returns the calling user's own workspace(s)", async () => {
    const membershipsA = await listMemberships(userA);
    const membershipsB = await listMemberships(userB);

    expect(membershipsA.map((m) => m.workspaceId)).toEqual([workspaceA.id]);
    expect(membershipsB.map((m) => m.workspaceId)).toEqual([workspaceB.id]);
  });

  it("a workspace-scoped member query never returns another workspace's members", async () => {
    const membersOfA = await WorkspaceMember.find({ workspaceId: workspaceA.id });
    expect(membersOfA).toHaveLength(1);
    expect(membersOfA[0].userId).toBe(userA);
  });
});

describe("protected routes (getWorkspaceContext / requireActiveWorkspace)", () => {
  let userId: string;
  let workspace: Awaited<ReturnType<typeof createWorkspaceWithOwner>>;

  beforeAll(async () => {
    userId = (await makeUser("protected")).id;
    workspace = await createWorkspaceWithOwner("Protected Route Co", userId);
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  beforeEach(() => {
    mockAuth.mockReset();
    mockCookies.mockReset();
    mockRedirect.mockClear();
  });

  it("getWorkspaceContext returns null when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const context = await getWorkspaceContext();
    expect(context).toBeNull();
  });

  it("requireActiveWorkspace redirects to workspace creation when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireActiveWorkspace()).rejects.toThrow("REDIRECT:/dashboard/workspaces/new");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/workspaces/new");
  });

  it("requireActiveWorkspace redirects when the signed-in user has zero workspaces", async () => {
    const orphan = await makeUser("no-workspace");
    try {
      mockAuth.mockResolvedValue({ user: { id: orphan.id } });
      mockCookies.mockResolvedValue({ get: () => undefined });
      await expect(requireActiveWorkspace()).rejects.toThrow("REDIRECT:/dashboard/workspaces/new");
    } finally {
      await cleanupUser(orphan.id);
    }
  });

  it("resolves the active workspace for a signed-in user via the active-workspace cookie", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspace.id } : undefined),
    });

    const active = await getActiveWorkspace();
    expect(active?.workspace.id).toBe(workspace.id);
    expect(active?.role).toBe("OWNER");
  });

  it("falls back to the first membership when the cookie names a workspace the user isn't a member of", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: () => ({ value: "not-a-real-workspace-id" }) });

    const active = await getActiveWorkspace();
    expect(active?.workspace.id).toBe(workspace.id);
  });
});
