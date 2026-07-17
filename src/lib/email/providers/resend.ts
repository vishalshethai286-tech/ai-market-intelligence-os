import { EmailSendError, type EmailProvider, type SendEmailInput, type SendEmailResult } from "../types";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Real Resend provider — calls Resend's REST API directly via fetch rather
 * than adding the `resend` SDK as a dependency, since it's one simple JSON
 * POST. Requires RESEND_API_KEY and EMAIL_FROM; throws EmailSendError on any
 * non-2xx response or network failure, since (unlike search) a failed send
 * is this feature's entire deliverable, not best-effort enrichment.
 */
export const resendEmailProvider: EmailProvider = {
  name: "RESEND",

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new EmailSendError("RESEND_API_KEY and EMAIL_FROM must both be set to send real email.");
    }

    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });
    } catch (error) {
      throw new EmailSendError(
        `Could not reach the email provider: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new EmailSendError(`Email provider responded with ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { id: data.id ?? null };
  },
};
