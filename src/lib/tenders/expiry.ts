import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TenderOpportunity as TenderOpportunityModel } from "@/models";

/** Statuses that represent a final human decision — expiry never overrides these, even if the deadline has passed. */
const STATUSES_EXEMPT_FROM_EXPIRY = ["WON", "LOST", "SUBMITTED", "ARCHIVED", "EXPIRED"] as const;

export type UpdateExpiredTendersSummary = {
  expired: number;
};

/**
 * Marks every TenderOpportunity in a workspace whose endDate has passed as
 * EXPIRED, unless it's already in a terminal/exempt status (Won/Lost/
 * Submitted/Archived/already-Expired) — a human decision always wins over
 * the deadline clock. Never deletes anything; expired tenders stay fully
 * searchable/visible, just with an updated status.
 */
export async function updateExpiredTenders(workspaceId: string): Promise<UpdateExpiredTendersSummary> {
  await dbConnect();

  const result = await TenderOpportunityModel.updateMany(
    {
      workspaceId,
      endDate: { $ne: null, $lt: new Date() },
      status: { $nin: STATUSES_EXEMPT_FROM_EXPIRY },
    },
    { status: "EXPIRED" },
  );

  return { expired: result.modifiedCount ?? 0 };
}
