import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook-handlers";

/**
 * Stripe webhook receiver. Verifies the `stripe-signature` header against
 * STRIPE_WEBHOOK_SECRET (Stripe's own HMAC scheme — no network call, so this
 * is fully testable without a live Stripe account, see
 * src/lib/billing/webhook-handlers.test.ts) before touching the DB, so an
 * unsigned/forged request can't fabricate a subscription.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    return NextResponse.json(
      { error: `Invalid signature: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 400 },
    );
  }

  await handleStripeEvent(event);

  return NextResponse.json({ received: true });
}
