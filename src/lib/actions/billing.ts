"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageBilling } from "@/lib/access-control";
import { createCheckoutSession, PlanNotCheckoutableError, PlanNotFoundError } from "@/lib/billing/checkout";
import { isStripeConfigured } from "@/lib/billing/stripe";
import type { PlanKey } from "@/models";

export async function createCheckoutSessionAction(planKey: PlanKey): Promise<{ error: string } | undefined> {
  const session = await auth();
  if (!session?.user?.email) return { error: "You must be signed in." };

  const active = await requireActiveWorkspace();
  if (!canManageBilling(active.role)) {
    return { error: "Only an owner can manage billing." };
  }

  if (!isStripeConfigured()) {
    return { error: "Billing checkout isn't configured yet. Set STRIPE_SECRET_KEY to enable it." };
  }

  let url: string;
  try {
    url = await createCheckoutSession(active.workspace.id, planKey, session.user.email);
  } catch (error) {
    if (error instanceof PlanNotFoundError || error instanceof PlanNotCheckoutableError) {
      return { error: error.message };
    }
    return { error: "Couldn't start checkout right now. Please try again." };
  }

  redirect(url);
}
