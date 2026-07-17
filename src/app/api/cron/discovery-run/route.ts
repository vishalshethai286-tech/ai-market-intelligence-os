import { NextResponse } from "next/server";
import { runDailyDiscovery } from "@/lib/discovery-brain/daily";

/**
 * Cron-triggered Search Execution Engine run: executes one queued batch per
 * workspace with a Discovery Brain. Not yet wired into vercel.json's `crons`
 * — manual "Run Discovery Now" is the primary path for now; add a crons
 * entry here once daily execution is actually wanted in production. Vercel
 * Cron always sends a GET request, with CRON_SECRET as a Bearer token — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *
 * In production, CRON_SECRET must be set and match, or the request is
 * rejected — there is no fallback. Outside production (local dev, tests),
 * an unset CRON_SECRET allows the route to run unauthenticated so it can be
 * exercised without extra setup; once CRON_SECRET is set anywhere, it's
 * always enforced.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret) {
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const results = await runDailyDiscovery();

  return NextResponse.json({
    workspacesProcessed: results.length,
    workspacesSkipped: results.filter((r) => r.skipped).length,
    results,
  });
}
