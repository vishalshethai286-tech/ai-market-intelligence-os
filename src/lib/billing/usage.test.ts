import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Plan, Subscription, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { checkUsageLimit, enforceUsageLimit, incrementUsage, checkSeatLimit, UsageLimitExceededError } = await import("./usage");

await dbConnect();

const TEST_PREFIX = "vitest-usage-";

describe("billing usage", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let planId: string;
  let originalUsageLimits: Record<string, unknown>;
  let originalMaxSeats: number | null;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Usage Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Usage Test Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Usage Test Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;

    const plan = await Plan.findOne({ key: "FREE_TRIAL" });
    if (!plan) {
      throw new Error("Missing FREE_TRIAL plan — run the seed script.");
    }
    planId = plan.id;
    originalUsageLimits = { ...(plan.usageLimits as Record<string, unknown>) };
    originalMaxSeats = plan.maxSeats as number | null;
  });

  afterAll(async () => {
    // Restore the shared, seeded FREE_TRIAL plan — other test files (and
    // every future createWorkspaceWithOwner call) rely on its real limits.
    await Plan.updateOne({ _id: planId }, { usageLimits: originalUsageLimits, maxSeats: originalMaxSeats });
    await Subscription.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await TargetCustomer.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("fails open (unlimited) when the workspace has no resolvable Subscription/Plan", async () => {
    const result = await checkUsageLimit("workspace-that-does-not-exist", "customer_created");
    expect(result).toEqual({ allowed: true, current: 0, limit: null });
  });

  it("record-count metric: allowed while under the live collection count, blocked at the limit", async () => {
    await Plan.updateOne({ _id: planId }, { $set: { "usageLimits.maxCustomers": 2 } });

    const before = await checkUsageLimit(workspaceId, "customer_created");
    expect(before).toEqual({ allowed: true, current: 0, limit: 2 });

    await TargetCustomer.create({
      workspaceId,
      customerName: "Usage Test Customer 1",
      rawSearchResultId: "raw-1",
      discoveryRunId: "run-1",
      sourceHistory: [],
      status: "NEW",
    });
    await TargetCustomer.create({
      workspaceId,
      customerName: "Usage Test Customer 2",
      rawSearchResultId: "raw-2",
      discoveryRunId: "run-1",
      sourceHistory: [],
      status: "NEW",
    });

    const atLimit = await checkUsageLimit(workspaceId, "customer_created");
    expect(atLimit).toEqual({ allowed: false, current: 2, limit: 2 });

    await expect(enforceUsageLimit(workspaceId, "customer_created")).rejects.toThrow(UsageLimitExceededError);
  });

  it("record-count metric is workspace-isolated — another workspace's count is unaffected", async () => {
    const otherResult = await checkUsageLimit(otherWorkspaceId, "customer_created");
    expect(otherResult.current).toBe(0);
  });

  it("-1 (unlimited) never blocks regardless of the live count", async () => {
    await Plan.updateOne({ _id: planId }, { $set: { "usageLimits.maxCustomers": -1 } });
    const result = await checkUsageLimit(workspaceId, "customer_created");
    expect(result).toEqual({ allowed: true, current: 0, limit: null });
  });

  it("monthly-flow metric: incrementUsage logs a row, checkUsageLimit sums within the current period", async () => {
    await Plan.updateOne({ _id: planId }, { $set: { "usageLimits.discoveryCreditsPerMonth": 3 } });

    const before = await checkUsageLimit(workspaceId, "discovery_search_execution");
    expect(before.current).toBe(0);

    await incrementUsage(workspaceId, "discovery_search_execution", 2);
    const afterFirst = await checkUsageLimit(workspaceId, "discovery_search_execution");
    expect(afterFirst).toEqual({ allowed: true, current: 2, limit: 3 });

    await incrementUsage(workspaceId, "discovery_search_execution", 1);
    const atLimit = await checkUsageLimit(workspaceId, "discovery_search_execution");
    expect(atLimit).toEqual({ allowed: false, current: 3, limit: 3 });
  });

  it("monthly-flow usage is workspace-isolated — another workspace's usage is unaffected", async () => {
    const otherResult = await checkUsageLimit(otherWorkspaceId, "discovery_search_execution");
    expect(otherResult.current).toBe(0);
  });

  it("a metric with no configured limit key (e.g. raw_search_result_stored) is never limit-checked", async () => {
    await incrementUsage(workspaceId, "raw_search_result_stored", 1000);
    const result = await checkUsageLimit(workspaceId, "raw_search_result_stored");
    expect(result).toEqual({ allowed: true, current: 0, limit: null });
  });

  it("checkSeatLimit reflects the active WorkspaceMember count against plan.maxSeats", async () => {
    await Plan.updateOne({ _id: planId }, { $set: { maxSeats: 1 } });
    const result = await checkSeatLimit(workspaceId);
    expect(result).toEqual({ allowed: false, current: 1, limit: 1 });
  });
});
