import "server-only";
import Stripe from "stripe";
import { dbConnect } from "@/lib/mongodb";
import { Plan, Subscription } from "@/models";
import type { PlanKey, SubscriptionStatus } from "@/models";

const STRIPE_STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "EXPIRED",
  unpaid: "PAST_DUE",
  paused: "PAST_DUE",
};

function toDate(unixSeconds: number | null | undefined): Date | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000) : null;
}

/**
 * A checkout session completing confirms payment and links the workspace to
 * its Stripe customer/subscription — the actual status/period sync happens
 * via the customer.subscription.* events Stripe sends around the same time,
 * so this upsert leaves those fields to be filled in by handleSubscriptionEvent.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
  const planKey = session.metadata?.planKey;
  if (!workspaceId || !planKey) return;

  const plan = await Plan.findOne({ key: planKey as PlanKey });
  if (!plan) return;

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  await Subscription.findOneAndUpdate(
    { workspaceId },
    {
      $set: {
        planId: plan.id,
        status: "ACTIVE",
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
        canceledAt: null,
        cancelAt: null,
      },
    },
    { upsert: true },
  );
}

/** Syncs status/period/cancellation fields from a customer.subscription.* event onto the matching Subscription row. */
async function handleSubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const existing = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  if (!existing) return;

  const item = subscription.items.data[0];

  await Subscription.updateOne(
    { _id: existing.id },
    {
      status: STRIPE_STATUS_MAP[subscription.status] ?? "INCOMPLETE",
      currentPeriodStart: toDate(item?.current_period_start),
      currentPeriodEnd: toDate(item?.current_period_end),
      cancelAt: toDate(subscription.cancel_at),
      canceledAt: toDate(subscription.canceled_at),
    },
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const existing = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  if (!existing) return;

  await Subscription.updateOne({ _id: existing.id }, { status: "CANCELED", canceledAt: new Date() });
}

/** Dispatches a verified Stripe event to the right handler. Unrecognized event types are ignored, not errors — Stripe sends many event types this app doesn't act on. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  await dbConnect();
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    default:
      return;
  }
}
