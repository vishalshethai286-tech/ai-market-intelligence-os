"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscriptionAtPeriodEnd,
  PlanNotCheckoutableError,
  PlanNotFoundError,
  NoStripeCustomerError,
  NoStripeSubscriptionError,
} from "@/lib/billing/checkout";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import type { PlanKey } from "@/models";

export async function createCheckoutSessionAction(planKey: PlanKey): Promise<{ error: string } | undefined> {
  const session = await auth();
  if (!session?.user?.email) return { error: "You must be signed in." };

  const active = await requireActiveWorkspace();
  if (!hasPermission(active.role, "manage_billing")) {
    return { error: "Only an owner can manage billing." };
  }

  if (!isStripeConfigured()) {
    return { error: "Billing checkout isn't configured yet. Set STRIPE_SECRET_KEY to enable it." };
  }

  let url: string;
  try {
    enforceRateLimit(active.workspace.id, "billing_checkout");
    url = await createCheckoutSession(active.workspace.id, planKey, session.user.email);
  } catch (error) {
    if (error instanceof PlanNotFoundError || error instanceof PlanNotCheckoutableError || error instanceof RateLimitExceededError) {
      return { error: error.message };
    }
    return { error: "Couldn't start checkout right now. Please try again." };
  }

  redirect(url);
}

/** Opens Stripe's hosted Billing Portal — self-serve invoice history, payment method updates, and (if enabled in the Stripe dashboard) cancellation. */
export async function createBillingPortalSessionAction(): Promise<{ error: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!hasPermission(active.role, "manage_billing")) {
    return { error: "Only an owner can manage billing." };
  }

  if (!isStripeConfigured()) {
    return { error: "Billing isn't configured yet. Set STRIPE_SECRET_KEY to enable it." };
  }

  let url: string;
  try {
    url = await createBillingPortalSession(active.workspace.id);
  } catch (error) {
    if (error instanceof NoStripeCustomerError) return { error: error.message };
    return { error: "Couldn't open the billing portal right now. Please try again." };
  }

  redirect(url);
}

/** Cancels the workspace's Stripe subscription at the end of the current billing period — access continues until then. The Subscription row's cancelAt is synced by the subsequent webhook, not set here. */
export async function cancelSubscriptionAction(): Promise<{ error: string } | { ok: true }> {
  const active = await requireActiveWorkspace();
  if (!hasPermission(active.role, "manage_billing")) {
    return { error: "Only an owner can manage billing." };
  }

  if (!isStripeConfigured()) {
    return { error: "Billing isn't configured yet. Set STRIPE_SECRET_KEY to enable it." };
  }

  try {
    await cancelSubscriptionAtPeriodEnd(active.workspace.id);
  } catch (error) {
    if (error instanceof NoStripeSubscriptionError) return { error: error.message };
    return { error: "Couldn't cancel the subscription right now. Please try again." };
  }

  revalidatePath("/dashboard/billing");
  return { ok: true };
}
