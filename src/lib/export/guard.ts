import "server-only";
import { checkUsageLimit, incrementUsage, UsageLimitExceededError } from "@/lib/billing/usage";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

/** Rate-limits and checks the workspace's exportsPerMonth limit, then (if both pass) logs the export. Call once per export route, before building the CSV. */
export async function guardExport(workspaceId: string): Promise<void> {
  enforceRateLimit(workspaceId, "export_csv");

  const check = await checkUsageLimit(workspaceId, "export_generated");
  if (!check.allowed) {
    throw new UsageLimitExceededError("export_generated", check.current, check.limit as number);
  }
  await incrementUsage(workspaceId, "export_generated");
}

export { UsageLimitExceededError, RateLimitExceededError };
