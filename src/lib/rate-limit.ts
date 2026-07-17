import "server-only";

export class RateLimitExceededError extends Error {
  constructor(message = "Too many requests — please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

/**
 * Enabled by default only in production; RATE_LIMIT_ENABLED=true/false
 * overrides explicitly either direction. Bypassed by default in
 * development/test so local workflows and the test suite are never
 * throttled — same "explicit opt-in gate" convention as RUN_LIVE_AI_TESTS
 * and RUN_LIVE_STRIPE_TESTS.
 */
function isEnabled(): boolean {
  if (process.env.RATE_LIMIT_ENABLED === "true") return true;
  if (process.env.RATE_LIMIT_ENABLED === "false") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Fixed-window counter, in-memory only — sufficient for a single-process
 * deployment; a multi-instance deployment would need a shared store (Redis)
 * instead. `key` may be called `limit` times per `windowMs`; throws once
 * exceeded. Not exported directly — go through enforceRateLimit() below so
 * every call site uses one of the named, tuned limits.
 */
function checkRateLimit(key: string, limit: number, windowMs: number): void {
  if (!isEnabled()) return;

  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  existing.count += 1;
  if (existing.count > limit) {
    throw new RateLimitExceededError();
  }
}

/** Per-workspace-per-action limits for the handful of expensive/abusable actions called out in the Phase 12 spec. */
const RATE_LIMITS = {
  run_discovery: { limit: 10, windowMs: 60_000 },
  process_extraction: { limit: 10, windowMs: 60_000 },
  export_csv: { limit: 20, windowMs: 60_000 },
  generate_email_draft: { limit: 30, windowMs: 60_000 },
  contact_discovery_batch: { limit: 10, windowMs: 60_000 },
  billing_checkout: { limit: 5, windowMs: 60_000 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/** Throws RateLimitExceededError if `workspaceId` has called `action` too many times in the current window. Call before the expensive/abusable work, not after. */
export function enforceRateLimit(workspaceId: string, action: RateLimitedAction): void {
  const { limit, windowMs } = RATE_LIMITS[action];
  checkRateLimit(`${workspaceId}:${action}`, limit, windowMs);
}
