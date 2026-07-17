import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageBilling } from "@/lib/access-control";
import { dbConnect } from "@/lib/mongodb";
import { Plan, Subscription } from "@/models";
import type { Plan as PlanType, Subscription as SubscriptionType } from "@/models";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradeButton } from "@/components/billing/upgrade-button";

export const metadata: Metadata = { title: "Billing" };

function formatPrice(priceCents: number, currency: string): string {
  if (priceCents === 0) return "Custom";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
}

export default async function BillingPage() {
  const active = await requireActiveWorkspace();
  const canManage = canManageBilling(active.role);

  await dbConnect();
  const [subscriptionDoc, planDocs] = await Promise.all([
    Subscription.findOne({ workspaceId: active.workspace.id }),
    Plan.find({ isActive: true }).sort({ sortOrder: 1 }),
  ]);

  const plans = planDocs.map((p) => p.toObject() as PlanType);

  // Manual "join" — no Mongoose populate is set up (ids are plain strings, no `ref`).
  let subscription: (SubscriptionType & { plan: PlanType }) | null = null;
  if (subscriptionDoc) {
    const planDoc = await Plan.findById(subscriptionDoc.planId);
    subscription = { ...(subscriptionDoc.toObject() as SubscriptionType), plan: planDoc!.toObject() as PlanType };
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Billing"
        description={
          isStripeConfigured()
            ? "Plan and subscription for this workspace."
            : "Plan and subscription for this workspace. Checkout is wired up but not configured in this environment (no STRIPE_SECRET_KEY) — Upgrade will show an error until it's set."
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            {subscription
              ? `${subscription.plan.name} · ${subscription.status.toLowerCase()}`
              : "No active subscription"}
          </CardDescription>
        </CardHeader>
        {!canManage && (
          <CardContent className="text-sm text-black/50 dark:text-white/50">
            Only an owner can change billing.
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.id === subscription?.planId ? "border-black/30 dark:border-white/40" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                {plan.id === subscription?.planId && <Badge variant="success">Current</Badge>}
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tracking-tight">
                {formatPrice(plan.priceCents, plan.currency)}
                {plan.priceCents > 0 && (
                  <span className="text-sm font-normal text-black/50 dark:text-white/50">
                    /{plan.billingInterval === "MONTHLY" ? "mo" : "yr"}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-black/50 dark:text-white/50">
                {plan.maxSeats ? `Up to ${plan.maxSeats} seats` : "Unlimited seats"}
              </p>
              {canManage && plan.id !== subscription?.planId && (
                <UpgradeButton
                  planKey={plan.key}
                  label={plan.stripePriceId ? `Switch to ${plan.name}` : "Contact sales"}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
