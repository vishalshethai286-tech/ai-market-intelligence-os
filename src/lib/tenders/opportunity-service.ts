import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TenderOpportunity as TenderOpportunityModel } from "@/models";
import type { TenderOpportunity, TenderOpportunityStatus } from "@/models";

export class TenderOpportunityNotFoundError extends Error {}

export type TenderOpportunityFilters = {
  q?: string;
  country?: string;
  priority?: string;
  status?: string;
  /** "ACTIVE" (endDate in the future or unknown) or "EXPIRED" (endDate in the past). Omit for both. */
  activeState?: "ACTIVE" | "EXPIRED";
  sortBy?: "endDate" | "priorityScore" | "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated TenderOpportunities for a workspace, for the Live Tenders page. */
export async function listTenderOpportunities(workspaceId: string, filters: TenderOpportunityFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.country) query.country = filters.country;
  if (filters.priority) query.priority = filters.priority;
  if (filters.status) query.status = filters.status;
  if (filters.activeState === "ACTIVE") query.$or = [{ endDate: null }, { endDate: { $gte: new Date() } }];
  if (filters.activeState === "EXPIRED") query.endDate = { $ne: null, $lt: new Date() };
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      { $or: [{ customerName: regex }, { buyerOrganization: regex }, { tenderTitle: regex }, { productsServicesRequired: regex }] },
    ];
  }

  const [total, rows] = await Promise.all([
    TenderOpportunityModel.countDocuments(query),
    TenderOpportunityModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    opportunities: rows.map((r) => r.toObject() as TenderOpportunity),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTenderOpportunity(workspaceId: string, id: string): Promise<TenderOpportunity> {
  await dbConnect();
  const opportunity = await TenderOpportunityModel.findOne({ _id: id, workspaceId });
  if (!opportunity) throw new TenderOpportunityNotFoundError("That tender opportunity doesn't exist in this workspace.");
  return opportunity.toObject() as TenderOpportunity;
}

export async function updateTenderOpportunityStatus(
  workspaceId: string,
  id: string,
  status: TenderOpportunityStatus,
): Promise<TenderOpportunity> {
  await dbConnect();
  const opportunity = await TenderOpportunityModel.findOne({ _id: id, workspaceId });
  if (!opportunity) throw new TenderOpportunityNotFoundError("That tender opportunity doesn't exist in this workspace.");
  opportunity.status = status;
  await opportunity.save();
  return opportunity.toObject() as TenderOpportunity;
}

/** How many TenderOpportunity rows trace back to a given DiscoveryRun — for the Discovery Run detail page. */
export async function countTenderOpportunitiesForRun(workspaceId: string, discoveryRunId: string): Promise<number> {
  await dbConnect();
  return TenderOpportunityModel.countDocuments({ workspaceId, discoveryRunId });
}

export type TenderDashboardStats = {
  totalBuyers: number;
  totalOpportunities: number;
  newToday: number;
  active: number;
  expired: number;
  aPlusCount: number;
  byPriority: Record<string, number>;
  byCountry: { country: string; count: number }[];
  expiringSoon: TenderOpportunity[];
};

/** Aggregated counts for the dashboard's tender summary section — combines both TenderBuyer and TenderOpportunity totals plus opportunity-specific breakdowns. */
export async function getTenderDashboardStats(workspaceId: string, totalBuyers: number): Promise<TenderDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [totalOpportunities, newToday, active, expired, aPlusCount, priorityAgg, countryAgg, expiringSoonDocs] = await Promise.all([
    TenderOpportunityModel.countDocuments({ workspaceId }),
    TenderOpportunityModel.countDocuments({ workspaceId, createdAt: { $gte: startOfToday } }),
    TenderOpportunityModel.countDocuments({ workspaceId, $or: [{ endDate: null }, { endDate: { $gte: now } }] }),
    TenderOpportunityModel.countDocuments({ workspaceId, endDate: { $ne: null, $lt: now } }),
    TenderOpportunityModel.countDocuments({ workspaceId, priority: "A_PLUS" }),
    TenderOpportunityModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    TenderOpportunityModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    TenderOpportunityModel.find({ workspaceId, endDate: { $gte: now, $lte: sevenDaysOut } }).sort({ endDate: 1 }).limit(5),
  ]);

  const byPriority: Record<string, number> = {};
  for (const row of priorityAgg as { _id: string | null; count: number }[]) {
    byPriority[row._id ?? "UNSCORED"] = row.count;
  }

  return {
    totalBuyers,
    totalOpportunities,
    newToday,
    active,
    expired,
    aPlusCount,
    byPriority,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    expiringSoon: expiringSoonDocs.map((r) => r.toObject() as TenderOpportunity),
  };
}
