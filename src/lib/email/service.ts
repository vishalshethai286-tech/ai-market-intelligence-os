import "server-only";
import { mockEmailProvider } from "./providers/mock";
import { resendEmailProvider } from "./providers/resend";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "./types";

export { EmailSendError } from "./types";

/** Real provider whenever RESEND_API_KEY is configured; MOCK otherwise — same "never hard-fail without a key" convention as Search Service and AI Extraction. */
function activeProvider(): EmailProvider {
  return process.env.RESEND_API_KEY ? resendEmailProvider : mockEmailProvider;
}

export function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  return activeProvider().send(input);
}
