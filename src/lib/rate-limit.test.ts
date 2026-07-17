import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit, RateLimitExceededError } from "./rate-limit";

describe("rate-limit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never blocks when RATE_LIMIT_ENABLED is unset and NODE_ENV is not production", () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "");
    vi.stubEnv("NODE_ENV", "test");
    const workspaceId = `workspace-bypass-${Date.now()}`;
    for (let i = 0; i < 50; i++) {
      expect(() => enforceRateLimit(workspaceId, "run_discovery")).not.toThrow();
    }
  });

  it("blocks after the limit is exceeded within the window when explicitly enabled", () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    const workspaceId = `workspace-enabled-${Date.now()}`;
    // billing_checkout allows 5 calls per window.
    for (let i = 0; i < 5; i++) {
      expect(() => enforceRateLimit(workspaceId, "billing_checkout")).not.toThrow();
    }
    expect(() => enforceRateLimit(workspaceId, "billing_checkout")).toThrow(RateLimitExceededError);
  });

  it("RATE_LIMIT_ENABLED=false bypasses even in production", () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "false");
    vi.stubEnv("NODE_ENV", "production");
    const workspaceId = `workspace-prod-bypass-${Date.now()}`;
    for (let i = 0; i < 50; i++) {
      expect(() => enforceRateLimit(workspaceId, "run_discovery")).not.toThrow();
    }
  });

  it("different workspaces have independent buckets for the same action", () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    const workspaceA = `workspace-iso-a-${Date.now()}`;
    const workspaceB = `workspace-iso-b-${Date.now()}`;
    for (let i = 0; i < 5; i++) enforceRateLimit(workspaceA, "billing_checkout");
    expect(() => enforceRateLimit(workspaceA, "billing_checkout")).toThrow(RateLimitExceededError);
    expect(() => enforceRateLimit(workspaceB, "billing_checkout")).not.toThrow();
  });

  it("different actions for the same workspace have independent buckets", () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    const workspaceId = `workspace-action-iso-${Date.now()}`;
    for (let i = 0; i < 5; i++) enforceRateLimit(workspaceId, "billing_checkout");
    expect(() => enforceRateLimit(workspaceId, "billing_checkout")).toThrow(RateLimitExceededError);
    expect(() => enforceRateLimit(workspaceId, "generate_email_draft")).not.toThrow();
  });
});
