import "server-only";
import Stripe from "stripe";

export class StripeNotConfiguredError extends Error {}

let cached: Stripe | null = null;

/**
 * Lazily constructs the Stripe client on first use rather than at module
 * load — importing this module (e.g. transitively via the billing page)
 * must not crash the app just because STRIPE_SECRET_KEY isn't set, same
 * "optional feature degrades gracefully" convention as every other
 * external-API integration in this app (Anthropic, search providers, email).
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new StripeNotConfiguredError("STRIPE_SECRET_KEY is not set.");
  }

  cached = new Stripe(apiKey);
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
