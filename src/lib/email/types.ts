export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = { id: string | null };

export interface EmailProvider {
  readonly name: "RESEND" | "MOCK";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export class EmailSendError extends Error {}
