/**
 * Runs once when a new Next.js server instance starts, before it accepts any
 * requests — the right place for a startup env-var check, since a throw here
 * fails the server start with one clear message instead of the same problem
 * (e.g. a missing DATABASE_URL) surfacing later as a confusing crash deep
 * inside the first request that needs it.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
