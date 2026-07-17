import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { Plan, Subscription } from "@/models";
import type { PlanKey } from "@/models";
import { getStripeClient } from "./stripe";

export class PlanNotCheckoutableError extends Error {}
export class PlanNotFoundError extends Error {}

/**
 * Creates a Stripe Checkout Session for a workspace to subscribe to `planKey`,
 * reusing the workspace's existing Stripe customer if it already has one
 * (from a prior/current subscription) so payment history stays on one
 * customer. Returns the hosted checkout URL to redirect the browser to —
 * the actual Subscription row is created/updated by the webhook handler
 * (checkout.session.completed), not here, since the user hasn't paid yet.
 */
export async function createCheckoutSession(
  workspaceId: string,
  planKey: PlanKey,
  userEmail: string,
): Promise<string> {
  await dbConnect();
  const [plan, existingSubscription] = await Promise.all([
    Plan.findOne({ key: planKey }),
    Subscription.findOne({ workspaceId }),
  ]);

  if (!plan || !plan.isActive) {
    throw new PlanNotFoundError("That plan doesn't exist or isn't available.");
  }
  if (!plan.stripePriceId) {
    throw new PlanNotCheckoutableError(
      `${plan.name} doesn't have self-serve checkout configured — contact sales instead.`,
    );
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    customer: existingSubscription?.stripeCustomerId ?? undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : userEmail,
    client_reference_id: workspaceId,
    metadata: { workspaceId, planKey },
    subscription_data: { metadata: { workspaceId, planKey } },
    success_url: `${appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }
  return session.url;
}

export class NoStripeCustomerError extends Error {}

/** Opens Stripe's hosted Billing Portal (update payment method, view invoices, cancel) for a workspace that already has a Stripe customer — i.e. has completed checkout at least once. */
export async function createBillingPortalSession(workspaceId: string): Promise<string> {
  await dbConnect();
  const subscription = await Subscription.findOne({ workspaceId });
  if (!subscription?.stripeCustomerId) {
    throw new NoStripeCustomerError("This workspace doesn't have a Stripe billing account yet — start checkout first.");
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/dashboard/billing`,
  });

  return session.url;
}

export class NoStripeSubscriptionError extends Error {}

/**
 * Cancels a real Stripe subscription at the end of the current billing
 * period (not immediately, so the workspace keeps access it already paid
 * for). The Subscription row's cancelAt/status are updated by the
 * subsequent customer.subscription.updated webhook, not here — same
 * "webhook is the source of truth" pattern as checkout.
 */
export async function cancelSubscriptionAtPeriodEnd(workspaceId: string): Promise<void> {
  await dbConnect();
  const subscription = await Subscription.findOne({ workspaceId });
  if (!subscription?.stripeSubscriptionId) {
    throw new NoStripeSubscriptionError("This workspace doesn't have an active Stripe subscription to cancel.");
  }

  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
}
