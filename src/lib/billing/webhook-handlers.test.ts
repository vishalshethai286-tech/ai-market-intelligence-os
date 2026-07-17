import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Plan, Subscription } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { handleStripeEvent } = await import("./webhook-handlers");

await dbConnect();

const TEST_PREFIX = "vitest-stripe-webhook-";

function fakeEvent(type: string, object: unknown): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event;
}

describe("handleStripeEvent", () => {
  let userId: string;
  let workspaceId: string;
  let planId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Stripe Webhook" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Stripe Webhook Co", userId);
    workspaceId = workspace.id;
    const plan = await Plan.findOne({ key: "STARTER" });
    if (!plan) {
      throw new Error('Missing STARTER plan — run the seed script.');
    }
    planId = plan.id;
  });

  afterAll(async () => {
    // Mongoose has no Prisma-style onDelete: Cascade — deleting the
    // Workspace/User doesn't remove the Subscription this test creates, so
    // it must be cleaned up explicitly or it leaks into the next run and
    // collides with the unique stripeSubscriptionId index.
    await Subscription.deleteOne({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("checkout.session.completed creates an ACTIVE Subscription linked to the workspace and Stripe ids", async () => {
    await handleStripeEvent(
      fakeEvent("checkout.session.completed", {
        client_reference_id: workspaceId,
        metadata: { workspaceId, planKey: "STARTER" },
        customer: "cus_test123",
        subscription: "sub_test123",
      }),
    );

    const subscription = await Subscription.findOne({ workspaceId });
    expect(subscription).not.toBeNull();
    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.planId).toBe(planId);
    expect(subscription?.stripeCustomerId).toBe("cus_test123");
    expect(subscription?.stripeSubscriptionId).toBe("sub_test123");
  });

  it("ignores a checkout.session.completed with no workspaceId in metadata", async () => {
    const before = await Subscription.countDocuments();
    await handleStripeEvent(fakeEvent("checkout.session.completed", { metadata: {}, customer: "cus_x" }));
    const after = await Subscription.countDocuments();
    expect(after).toBe(before);
  });

  it("customer.subscription.updated syncs status and period onto the matching Subscription", async () => {
    const periodStart = Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 24 * 60 * 60;

    await handleStripeEvent(
      fakeEvent("customer.subscription.updated", {
        id: "sub_test123",
        status: "past_due",
        cancel_at: null,
        canceled_at: null,
        items: { data: [{ current_period_start: periodStart, current_period_end: periodEnd }] },
      }),
    );

    const subscription = await Subscription.findOne({ workspaceId });
    expect(subscription?.status).toBe("PAST_DUE");
    expect(subscription?.currentPeriodStart?.getTime()).toBe(periodStart * 1000);
    expect(subscription?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
  });

  it("customer.subscription.updated for an unknown subscription id is a no-op, not an error", async () => {
    await expect(
      handleStripeEvent(
        fakeEvent("customer.subscription.updated", {
          id: "sub_does_not_exist",
          status: "active",
          items: { data: [] },
        }),
      ),
    ).resolves.not.toThrow();
  });

  it("customer.subscription.deleted marks the Subscription CANCELED", async () => {
    await handleStripeEvent(fakeEvent("customer.subscription.deleted", { id: "sub_test123" }));

    const subscription = await Subscription.findOne({ workspaceId });
    expect(subscription?.status).toBe("CANCELED");
    expect(subscription?.canceledAt).not.toBeNull();
  });

  it("ignores event types it doesn't handle", async () => {
    await expect(handleStripeEvent(fakeEvent("invoice.paid", {}))).resolves.not.toThrow();
  });
});
