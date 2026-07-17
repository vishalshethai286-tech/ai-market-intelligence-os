import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageBilling } from "@/lib/access-control";
import { dbConnect } from "@/lib/mongodb";
import { Plan, Subscription } from "@/models";
import type { Plan as PlanType, Subscription as SubscriptionType } from "@/models";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getWorkspaceUsage } from "@/lib/billing/usage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { BillingPortalButton } from "@/components/billing/billing-portal-button";
import { CancelSubscriptionButton } from "@/components/billing/cancel-subscription-button";
import { UsageMeter } from "@/components/billing/usage-meter";

export const metadata: Metadata = { title: "Billing" };

function formatPrice(priceCents: number, currency: string): string {
  if (priceCents === 0) return "Custom";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  TRIALING: "warning",
  ACTIVE: "success",
  PAST_DUE: "danger",
  CANCELED: "danger",
  EXPIRED: "danger",
  INCOMPLETE: "default",
};

export default async function BillingPage() {
  const active = await requireActiveWorkspace();
  const canManage = canManageBilling(active.role);

  await dbConnect();
  const [subscriptionDoc, planDocs, usage] = await Promise.all([
    Subscription.findOne({ workspaceId: active.workspace.id }),
    Plan.find({ isActive: true }).sort({ sortOrder: 1 }),
    getWorkspaceUsage(active.workspace.id),
  ]);

  const plans = planDocs.map((p) => p.toObject() as PlanType);

  // Manual "join" — no Mongoose populate is set up (ids are plain strings, no `ref`).
  let subscription: (SubscriptionType & { plan: PlanType }) | null = null;
  if (subscriptionDoc) {
    const planDoc = await Plan.findById(subscriptionDoc.planId);
    subscription = { ...(subscriptionDoc.toObject() as SubscriptionType), plan: planDoc!.toObject() as PlanType };
  }

  const isMock = !subscription || subscription.billingProvider === "MOCK";
  const periodEndLabel = subscription?.currentPeriodEnd ? formatDate(new Date(subscription.currentPeriodEnd)) : formatDate(usage.periodEnd);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Billing"
        description={
          isStripeConfigured()
            ? "Plan, subscription, and usage for this workspace."
            : "Plan, subscription, and usage for this workspace. Checkout is wired up but not configured in this environment (no STRIPE_SECRET_KEY) — Upgrade will show an error until it's set."
        }
      />

      {isMock && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-300">
            Mock billing mode — this workspace isn&apos;t connected to a real Stripe subscription yet. Usage limits are still enforced against your plan, but no payment is being collected.
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Current plan</CardTitle>
            {subscription && (
              <Badge variant={STATUS_BADGE_VARIANT[subscription.status] ?? "default"}>{subscription.status.toLowerCase()}</Badge>
            )}
          </div>
          <CardDescription>
            {subscription ? subscription.plan.name : "No active subscription"}
            {subscription?.status === "TRIALING" && subscription.trialEndsAt && ` · trial ends ${formatDate(new Date(subscription.trialEndsAt))}`}
            {subscription && !isMock && ` · billing period ends ${periodEndLabel}`}
            {subscription?.cancelAt && ` · cancels ${formatDate(new Date(subscription.cancelAt))}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {!canManage ? (
            <p className="text-sm text-black/50 dark:text-white/50">Only an owner can change billing.</p>
          ) : (
            <>
              {!isMock && <BillingPortalButton />}
              {!isMock && subscription?.status === "ACTIVE" && !subscription.cancelAt && (
                <CancelSubscriptionButton periodEndLabel={periodEndLabel} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
          <CardDescription>Resets {formatDate(usage.periodEnd)}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <UsageMeter label="Seats" current={usage.seatsUsed} limit={usage.seatsLimit} percentUsed={usage.seatsLimit ? Math.round((usage.seatsUsed / usage.seatsLimit) * 100) : null} />
          {usage.metrics.map((metric) => (
            <UsageMeter key={metric.metric} label={metric.label} current={metric.current} limit={metric.limit} percentUsed={metric.percentUsed} />
          ))}
        </CardContent>
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
