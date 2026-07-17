import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  UsageLog as UsageLogModel,
  Subscription as SubscriptionModel,
  Plan as PlanModel,
  WorkspaceMember as WorkspaceMemberModel,
  TargetCustomer as TargetCustomerModel,
  ProjectOpportunity as ProjectOpportunityModel,
  TenderBuyer as TenderBuyerModel,
  TenderOpportunity as TenderOpportunityModel,
  VendorRegistration as VendorRegistrationModel,
  Contact as ContactModel,
  ProductService as ProductServiceModel,
} from "@/models";
import type { Plan, Subscription } from "@/models";

/**
 * Usage metering and plan-limit enforcement. Two different kinds of limit,
 * deliberately handled differently:
 *
 * - "Record count" limits (customers/projects/tender buyers/live tenders/
 *   vendor registrations/contacts/products-services) are a total-in-the-workspace
 *   cap, checked by counting the live collection directly — there's no
 *   separate counter to keep in sync, and it self-corrects if records are
 *   deleted/archived.
 * - "Monthly flow" limits (discovery credits, exports, email drafts,
 *   reports, AI extraction calls, contact discovery searches, raw search
 *   results) are metered by summing UsageLog rows within the current
 *   billing/trial period — logged via incrementUsage() at the point of use.
 *
 * Every check fails OPEN (never blocks) when a workspace has no
 * Subscription/Plan resolvable, or when a limit value is -1 ("unlimited")
 * or simply absent from the plan's usageLimits — this is what "mock billing
 * mode" means for usage enforcement: local dev/tests never get blocked
 * unless a real Plan with a real limit is seeded and a Subscription
 * actually links to it (both true in this app's shared dev/test database
 * once `npm run seed` has run, but never crash if it hasn't).
 */

export class UsageLimitExceededError extends Error {
  constructor(
    public readonly metric: UsageMetric,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(`Usage limit exceeded for ${metric}: ${current}/${limit}. Upgrade your plan to continue.`);
    this.name = "UsageLimitExceededError";
  }
}

/** Monthly-flow metrics — logged via incrementUsage(), summed over the current period by checkUsageLimit(). */
export const MONTHLY_FLOW_METRICS = [
  "discovery_search_execution",
  "raw_search_result_stored",
  "ai_extraction_call",
  "contact_discovery_search",
  "export_generated",
  "email_draft_generated",
  "report_generated",
] as const;
export type MonthlyFlowMetric = (typeof MONTHLY_FLOW_METRICS)[number];

/** Record-count metrics — checked live against the actual collection, never logged to UsageLog (the collection itself is the counter). */
export const RECORD_COUNT_METRICS = [
  "customer_created",
  "project_created",
  "tender_buyer_created",
  "live_tender_created",
  "vendor_registration_created",
  "contact_created",
  "product_service_created",
] as const;
export type RecordCountMetric = (typeof RECORD_COUNT_METRICS)[number];

export type UsageMetric = MonthlyFlowMetric | RecordCountMetric;

/** Which plan usageLimits key and live-collection lookup each RecordCountMetric maps to. */
const RECORD_COUNT_CONFIG: Record<RecordCountMetric, { limitKey: string; model: typeof TargetCustomerModel }> = {
  customer_created: { limitKey: "maxCustomers", model: TargetCustomerModel },
  project_created: { limitKey: "maxProjects", model: ProjectOpportunityModel },
  tender_buyer_created: { limitKey: "maxTenderBuyers", model: TenderBuyerModel },
  live_tender_created: { limitKey: "maxLiveTenders", model: TenderOpportunityModel },
  vendor_registration_created: { limitKey: "maxVendorRegistrations", model: VendorRegistrationModel },
  contact_created: { limitKey: "maxContacts", model: ContactModel },
  product_service_created: { limitKey: "maxProductsServices", model: ProductServiceModel },
};

/**
 * Which plan usageLimits key each MonthlyFlowMetric is capped by. Every
 * discovery search execution — including public contact discovery, which
 * runs through the same Search Execution Engine — is logged under
 * discovery_search_execution and draws from the same discoveryCreditsPerMonth
 * pool; contact_discovery_search is logged alongside it purely so the Usage
 * page can show "how many of my credits went to contact discovery" without
 * double-counting against the limit. Metrics with no entry here
 * (raw_search_result_stored, ai_extraction_call, contact_discovery_search)
 * are tracked for visibility only, not independently limit-checked.
 */
const MONTHLY_FLOW_LIMIT_KEY: Partial<Record<MonthlyFlowMetric, string>> = {
  discovery_search_execution: "discoveryCreditsPerMonth",
  export_generated: "exportsPerMonth",
};

const UNLIMITED = -1;

/** true = never restrict this metric, regardless of workspace/count — an absent key or an explicit -1 both mean "unlimited" for that plan. */
function isUnlimitedLimit(rawLimit: unknown): boolean {
  return rawLimit === undefined || rawLimit === null || rawLimit === UNLIMITED;
}

export async function incrementUsage(
  workspaceId: string,
  metric: MonthlyFlowMetric,
  quantity = 1,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await dbConnect();
  await UsageLogModel.create({ workspaceId, metric, quantity, metadata: metadata ?? null, occurredAt: new Date() });
}

export type ResolvedSubscription = { subscription: Subscription; plan: Plan } | null;

/** The workspace's Subscription + resolved Plan, or null if either is missing (a workspace whose seed/subscription setup hasn't run) — every caller must treat null as "don't restrict anything". */
export async function getWorkspaceSubscription(workspaceId: string): Promise<ResolvedSubscription> {
  await dbConnect();
  const subscriptionDoc = await SubscriptionModel.findOne({ workspaceId });
  if (!subscriptionDoc) return null;
  const planDoc = await PlanModel.findById(subscriptionDoc.planId);
  if (!planDoc) return null;
  return { subscription: subscriptionDoc.toObject() as Subscription, plan: planDoc.toObject() as Plan };
}

/** Start of the current usage-metering period — the subscription's own Stripe-synced billing period if it looks current, otherwise the calendar month (covers trial/mock subscriptions, which have no Stripe period). No physical "reset" happens anywhere: every monthly count is derived fresh from UsageLog rows on/after this date, so a new period starts working correctly the instant it begins. */
export function resolveUsagePeriodStart(subscription: Subscription): Date {
  const now = new Date();
  if (subscription.currentPeriodStart) {
    const start = new Date(subscription.currentPeriodStart);
    const ageDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= 0 && ageDays <= 31) return start;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Purely informational — there's no counter to zero out (see module
 * docblock), so this just returns the current period's start/end for
 * display (e.g. "resets on <date>" on the Usage page). Named to match the
 * spec's expected function list.
 */
export function resetMonthlyUsageIfNeeded(subscription: Subscription): { periodStart: Date; periodEnd: Date } {
  const periodStart = resolveUsagePeriodStart(subscription);
  const periodEnd =
    subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) > periodStart
      ? new Date(subscription.currentPeriodEnd)
      : new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, periodStart.getDate());
  return { periodStart, periodEnd };
}

export type UsageCheckResult = { allowed: boolean; current: number; limit: number | null };

/** Checks one metric against the workspace's plan without throwing. limit=null means unlimited (or no resolvable plan — fails open). */
export async function checkUsageLimit(workspaceId: string, metric: UsageMetric): Promise<UsageCheckResult> {
  await dbConnect();
  const resolved = await getWorkspaceSubscription(workspaceId);
  if (!resolved) return { allowed: true, current: 0, limit: null };

  const limits = resolved.plan.usageLimits as Record<string, unknown>;

  if (RECORD_COUNT_METRICS.includes(metric as RecordCountMetric)) {
    const config = RECORD_COUNT_CONFIG[metric as RecordCountMetric];
    const rawLimit = limits[config.limitKey];
    if (isUnlimitedLimit(rawLimit)) return { allowed: true, current: 0, limit: null };
    const limit = rawLimit as number;
    const current = await config.model.countDocuments({ workspaceId });
    return { allowed: current < limit, current, limit };
  }

  const limitKey = MONTHLY_FLOW_LIMIT_KEY[metric as MonthlyFlowMetric];
  if (!limitKey) return { allowed: true, current: 0, limit: null };
  const rawLimit = limits[limitKey];
  if (isUnlimitedLimit(rawLimit)) return { allowed: true, current: 0, limit: null };
  const limit = rawLimit as number;

  const { periodStart } = resetMonthlyUsageIfNeeded(resolved.subscription);
  const agg = await UsageLogModel.aggregate([
    { $match: { workspaceId, metric, occurredAt: { $gte: periodStart } } },
    { $group: { _id: null, total: { $sum: { $toDouble: "$quantity" } } } },
  ]);
  const current = (agg[0]?.total as number | undefined) ?? 0;
  return { allowed: current < limit, current, limit };
}

/** Throws UsageLimitExceededError if the workspace is at/over its plan limit for this metric — call before the action the limit protects, not after. */
export async function enforceUsageLimit(workspaceId: string, metric: UsageMetric): Promise<void> {
  const result = await checkUsageLimit(workspaceId, metric);
  if (!result.allowed) {
    throw new UsageLimitExceededError(metric, result.current, result.limit as number);
  }
}

/** Seats are plan.maxSeats directly (not a usageLimits key, not UsageLog-metered) — checked against active WorkspaceMember count before sending a new invite. Fails open (no resolvable plan, or maxSeats unset/-1) like every other check. */
export async function checkSeatLimit(workspaceId: string): Promise<UsageCheckResult> {
  await dbConnect();
  const resolved = await getWorkspaceSubscription(workspaceId);
  if (!resolved) return { allowed: true, current: 0, limit: null };

  const rawLimit = resolved.plan.maxSeats;
  if (isUnlimitedLimit(rawLimit)) return { allowed: true, current: 0, limit: null };
  const limit = rawLimit as number;

  const current = await WorkspaceMemberModel.countDocuments({ workspaceId, deletedAt: null, status: "ACTIVE" });
  return { allowed: current < limit, current, limit };
}

export type WorkspaceUsageMetric = {
  metric: UsageMetric;
  label: string;
  current: number;
  limit: number | null;
  percentUsed: number | null;
};

export type WorkspaceUsage = {
  planName: string;
  subscriptionStatus: Subscription["status"] | null;
  billingProvider: Subscription["billingProvider"] | null;
  trialEndsAt: Date | null;
  periodStart: Date;
  periodEnd: Date;
  seatsUsed: number;
  seatsLimit: number | null;
  metrics: WorkspaceUsageMetric[];
};

const METRIC_LABELS: Record<UsageMetric, string> = {
  customer_created: "Customers",
  project_created: "Projects",
  tender_buyer_created: "Tender buyers",
  live_tender_created: "Live tenders",
  vendor_registration_created: "Vendor registrations",
  contact_created: "Contacts",
  product_service_created: "Products/services",
  discovery_search_execution: "Discovery credits",
  raw_search_result_stored: "Raw search results stored",
  ai_extraction_call: "AI extraction calls",
  contact_discovery_search: "Contact discovery searches",
  export_generated: "Exports generated",
  email_draft_generated: "Email drafts generated",
  report_generated: "Reports generated",
};

/** Full usage snapshot for a workspace — every metered metric's current/limit/percentUsed, for the dashboard widgets and the Usage page. Never throws; a workspace with no Subscription/Plan gets an "unlimited, mock" snapshot instead of an error. */
export async function getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
  await dbConnect();
  const resolved = await getWorkspaceSubscription(workspaceId);

  if (!resolved) {
    const now = new Date();
    return {
      planName: "No plan",
      subscriptionStatus: null,
      billingProvider: null,
      trialEndsAt: null,
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      seatsUsed: 0,
      seatsLimit: null,
      metrics: [],
    };
  }

  const { subscription, plan } = resolved;
  const { periodStart, periodEnd } = resetMonthlyUsageIfNeeded(subscription);

  const seatsUsed = await WorkspaceMemberModel.countDocuments({ workspaceId, deletedAt: null, status: "ACTIVE" });

  const allMetrics: UsageMetric[] = [...RECORD_COUNT_METRICS, ...MONTHLY_FLOW_METRICS];
  const metrics = await Promise.all(
    allMetrics.map(async (metric): Promise<WorkspaceUsageMetric> => {
      const result = await checkUsageLimit(workspaceId, metric);
      const percentUsed = result.limit ? Math.round((result.current / result.limit) * 100) : null;
      return { metric, label: METRIC_LABELS[metric], current: result.current, limit: result.limit, percentUsed };
    }),
  );

  return {
    planName: plan.name,
    subscriptionStatus: subscription.status,
    billingProvider: subscription.billingProvider,
    trialEndsAt: subscription.trialEndsAt,
    periodStart,
    periodEnd,
    seatsUsed,
    seatsLimit: plan.maxSeats,
    metrics,
  };
}

export type UsageDashboardStats = {
  planName: string;
  subscriptionStatus: Subscription["status"] | null;
  trialEndsAt: Date | null;
  isTrialing: boolean;
  isNearAnyLimit: boolean;
  nearLimitMetrics: WorkspaceUsageMetric[];
  discoveryCreditsUsed: number;
  discoveryCreditsLimit: number | null;
  contactsUsed: number;
  contactsLimit: number | null;
  exportsUsed: number;
  exportsLimit: number | null;
};

/** Condensed usage summary for the main dashboard's SaaS/usage widgets — a small, render-ready subset of getWorkspaceUsage(), plus an upgrade-CTA trigger (80%+ used on any limited metric). */
export async function getUsageDashboardStats(workspaceId: string): Promise<UsageDashboardStats> {
  const usage = await getWorkspaceUsage(workspaceId);

  const nearLimitMetrics = usage.metrics.filter((m) => m.percentUsed !== null && m.percentUsed >= 80);
  const findMetric = (metric: UsageMetric) => usage.metrics.find((m) => m.metric === metric);

  return {
    planName: usage.planName,
    subscriptionStatus: usage.subscriptionStatus,
    trialEndsAt: usage.trialEndsAt,
    isTrialing: usage.subscriptionStatus === "TRIALING",
    isNearAnyLimit: nearLimitMetrics.length > 0,
    nearLimitMetrics,
    discoveryCreditsUsed: findMetric("discovery_search_execution")?.current ?? 0,
    discoveryCreditsLimit: findMetric("discovery_search_execution")?.limit ?? null,
    contactsUsed: findMetric("contact_created")?.current ?? 0,
    contactsLimit: findMetric("contact_created")?.limit ?? null,
    exportsUsed: findMetric("export_generated")?.current ?? 0,
    exportsLimit: findMetric("export_generated")?.limit ?? null,
  };
}
