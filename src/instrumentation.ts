/**
 * Runs once when a new Next.js server instance starts, before it accepts any
 * requests — the right place for a startup env-var check under `next start`,
 * since a throw here fails the server start with one clear message instead
 * of the same problem (e.g. a missing DATABASE_URL) surfacing later as a
 * confusing crash deep inside the first request that needs it.
 *
 * On Vercel this is NOT a reliable production gate: static/prerendered
 * routes and src/proxy.ts's redirect logic never invoke it at all, and if
 * this hook fails to load for a given function (Next.js treats a missing/
 * unloadable instrumentation module as "no hook configured" and silently
 * skips register() rather than failing the request), the check just never
 * runs — no error, no crash, traffic keeps flowing. The enforced-per-request
 * check lives in src/lib/prisma.ts, which every DB-touching code path
 * actually imports.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
