import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("@/lib/billing/webhook-handlers", () => ({ handleStripeEvent: vi.fn() }));

const { POST } = await import("./route");
const { handleStripeEvent } = await import("@/lib/billing/webhook-handlers");

const FAKE_WEBHOOK_SECRET = "whsec_test_secret_for_local_signature_verification_only";
const prevSecretKey = process.env.STRIPE_SECRET_KEY;
const prevWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function signedRequest(payload: string, secret = FAKE_WEBHOOK_SECRET): Request {
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.mocked(handleStripeEvent).mockReset().mockResolvedValue(undefined);
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_signature_verification_needs_no_real_key";
    process.env.STRIPE_WEBHOOK_SECRET = FAKE_WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (prevSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevSecretKey;
    if (prevWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhookSecret;
  });

  it("accepts a validly-signed payload, verified via real local HMAC (no network)", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", data: { object: {} } });
    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(handleStripeEvent).toHaveBeenCalledOnce();
  });

  it("rejects a payload with an invalid signature", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", data: { object: {} } });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=not-a-real-signature" },
      body: payload,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", data: { object: {} } });
    const response = await POST(signedRequest(payload, "whsec_a_completely_different_secret"));

    expect(response.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a request with no stripe-signature header", async () => {
    const request = new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET isn't configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=whatever" },
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});
