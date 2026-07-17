import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types";

/** Every email "sent" through the mock provider, most recent last — read by tests, cleared between them. */
export const sentEmails: SendEmailInput[] = [];

/**
 * No-network mock provider for local dev and tests — logs instead of
 * sending, same convention as the Search Service's MOCK provider and AI
 * Extraction's mock extractors. Used automatically whenever RESEND_API_KEY
 * is unset, so password reset / invite emails never hard-fail without a key.
 */
export const mockEmailProvider: EmailProvider = {
  name: "MOCK",

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    sentEmails.push(input);
    console.log(`[email:mock] To: ${input.to} | Subject: ${input.subject}`);
    return { id: null };
  },
};
