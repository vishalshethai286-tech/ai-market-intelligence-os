import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail, EmailSendError } from "./service";
import { sentEmails } from "./providers/mock";
import { passwordResetEmail, workspaceInviteEmail } from "./templates";

describe("sendEmail — mock provider (no RESEND_API_KEY)", () => {
  const prevKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    sentEmails.length = 0;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  });

  it("records the email instead of sending it, and returns a null id", async () => {
    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    expect(result.id).toBeNull();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ to: "user@example.com", subject: "Hi" });
  });
});

describe("sendEmail — Resend provider (RESEND_API_KEY set, fetch mocked — no real network)", () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Test <test@example.com>";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
    vi.unstubAllGlobals();
  });

  it("POSTs to the Resend API with the right auth header and body, returning the response id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "re_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });

    expect(result.id).toBe("re_abc123");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Test <test@example.com>", to: "user@example.com" });
  });

  it("throws EmailSendError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "Invalid from address" }),
    );

    await expect(
      sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
    ).rejects.toThrow(EmailSendError);
  });

  it("throws EmailSendError when the network request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
    ).rejects.toThrow(EmailSendError);
  });
});

describe("email templates", () => {
  it("passwordResetEmail includes the reset URL in both html and text", () => {
    const email = passwordResetEmail("https://app.example.com/reset-password?token=abc123");
    expect(email.html).toContain("https://app.example.com/reset-password?token=abc123");
    expect(email.text).toContain("https://app.example.com/reset-password?token=abc123");
    expect(email.subject.length).toBeGreaterThan(0);
  });

  it("workspaceInviteEmail includes the workspace name, inviter, and accept URL", () => {
    const email = workspaceInviteEmail("Acme Co", "Jane", "https://app.example.com/invite/tok123");
    expect(email.html).toContain("Acme Co");
    expect(email.html).toContain("Jane");
    expect(email.html).toContain("https://app.example.com/invite/tok123");
    expect(email.text).toContain("https://app.example.com/invite/tok123");
  });
});
