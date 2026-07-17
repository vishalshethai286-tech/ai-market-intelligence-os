import * as z from "zod";

/**
 * Environment variables the app cannot run without. Everything else in
 * .env.example (Stripe, search providers, email, storage, queue/cron,
 * logging, feature flags) gates one specific feature and is validated (if at
 * all) by that feature at the point of use, not here — see .env.example for
 * which category each variable belongs to and whether it's required.
 */
const RequiredEnvSchema = z.object({
  MONGODB_URI: z.string({ error: "MONGODB_URI is required — see .env.example." }).min(1, {
    error: "MONGODB_URI is required — see .env.example.",
  }),
  AUTH_SECRET: z.string({ error: "AUTH_SECRET is required — see .env.example." }).min(1, {
    error: "AUTH_SECRET is required — see .env.example.",
  }),
  NEXT_PUBLIC_APP_URL: z.url({
    error: "NEXT_PUBLIC_APP_URL is required and must be a valid URL, e.g. http://localhost:3000 — see .env.example.",
  }),
});

export class MissingEnvError extends Error {}

/**
 * Validates every required environment variable up front, failing fast with
 * one aggregated, human-readable error instead of letting each missing
 * variable surface later as a confusing runtime crash deep inside a request
 * (e.g. Mongoose throwing because MONGODB_URI was never set). Called from
 * `src/instrumentation.ts` on server start (reliable under `next start`,
 * best-effort on Vercel) and from `src/lib/mongodb.ts` on import (the gate
 * Vercel actually enforces per-request — see the comment there).
 */
export function validateEnv(): void {
  const result = RequiredEnvSchema.safeParse(process.env);
  if (result.success) return;

  const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new MissingEnvError(
    `Missing or invalid required environment variable(s):\n${lines.join("\n")}\n\n` +
      "Copy .env.example to .env and fill in real values, then restart the server.",
  );
}
