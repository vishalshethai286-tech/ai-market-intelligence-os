import { describe, expect, it } from "vitest";

const { dbConnect } = await import("@/lib/mongodb");
const { Plan } = await import("@/models");

await dbConnect();

const EXPECTED_PLAN_KEYS = ["FREE_TRIAL", "STARTER", "PROFESSIONAL", "BUSINESS", "GROWTH", "ENTERPRISE"];

/**
 * Sanity-checks the plan catalog seeded by `npm run seed` (scripts/seed.ts)
 * — doesn't re-run the seed script itself (it's a standalone script with
 * top-level DB-connect/disconnect side effects, not safe to import into the
 * shared test process), just verifies the 6 plans it's expected to have
 * already created in this shared test database are present and sane.
 */
describe("seeded plan catalog", () => {
  it("has all 6 plans, active, in the expected sort order", async () => {
    const plans = await Plan.find({}).sort({ sortOrder: 1 });
    if (plans.length === 0) {
      throw new Error("No plans found — run `npm run seed` against this database before running tests.");
    }
    const keys = plans.map((p) => p.key);
    expect(keys).toEqual(EXPECTED_PLAN_KEYS);
    for (const plan of plans) {
      expect(plan.isActive).toBe(true);
    }
  });

  it("FREE_TRIAL has a positive trial length and the usageLimits keys billing/usage.ts reads", async () => {
    const plan = await Plan.findOne({ key: "FREE_TRIAL" });
    expect(plan).not.toBeNull();
    expect(plan?.trialDays).toBeGreaterThan(0);
    const limits = plan?.usageLimits as Record<string, unknown>;
    for (const key of ["maxCustomers", "maxContacts", "discoveryCreditsPerMonth", "exportsPerMonth"]) {
      expect(limits).toHaveProperty(key);
    }
  });

  it("ENTERPRISE has no self-serve Stripe price (contact-sales only)", async () => {
    const plan = await Plan.findOne({ key: "ENTERPRISE" });
    expect(plan).not.toBeNull();
    expect(plan?.stripePriceId ?? null).toBeNull();
  });
});
