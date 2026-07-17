import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ./platform-admin imports @/auth (next-auth) and next/navigation, neither of
// which resolve/work outside a live Next.js request — mocked here even
// though this file only exercises the pure isPlatformAdminEmail() helper.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { isPlatformAdminEmail } = await import("./platform-admin");

describe("isPlatformAdminEmail", () => {
  const prev = process.env.PLATFORM_ADMIN_EMAILS;

  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@acme.com, Second.Admin@Acme.com ,third@acme.com";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = prev;
  });

  it("is true for an exact match", () => {
    expect(isPlatformAdminEmail("admin@acme.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPlatformAdminEmail("ADMIN@ACME.COM")).toBe(true);
  });

  it("tolerates whitespace around entries in the env var", () => {
    expect(isPlatformAdminEmail("second.admin@acme.com")).toBe(true);
  });

  it("is false for an email not in the list", () => {
    expect(isPlatformAdminEmail("someone-else@acme.com")).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(isPlatformAdminEmail(null)).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
  });

  it("is false for everyone when PLATFORM_ADMIN_EMAILS is unset", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(isPlatformAdminEmail("admin@acme.com")).toBe(false);
  });
});
