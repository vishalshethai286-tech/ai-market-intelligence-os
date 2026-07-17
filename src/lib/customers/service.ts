import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TargetCustomer as TargetCustomerModel } from "@/models";
import type { TargetCustomer, TargetCustomerStatus } from "@/models";

export class CustomerNotFoundError extends Error {}

export type CustomerFilters = {
  q?: string;
  country?: string;
  priority?: string;
  status?: string;
  sortBy?: "score" | "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated TargetCustomers for a workspace, for the Customers page. */
export async function listCustomers(workspaceId: string, filters: CustomerFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.country) query.country = filters.country;
  if (filters.priority) query.priority = filters.priority;
  if (filters.status) query.status = filters.status;
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ customerName: regex }, { website: regex }, { websiteDomain: regex }];
  }

  const [total, rows] = await Promise.all([
    TargetCustomerModel.countDocuments(query),
    TargetCustomerModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    customers: rows.map((r) => r.toObject() as TargetCustomer),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCustomer(workspaceId: string, id: string): Promise<TargetCustomer> {
  await dbConnect();
  const customer = await TargetCustomerModel.findOne({ _id: id, workspaceId });
  if (!customer) throw new CustomerNotFoundError("That customer doesn't exist in this workspace.");
  return customer.toObject() as TargetCustomer;
}

export async function updateCustomerStatus(
  workspaceId: string,
  id: string,
  status: TargetCustomerStatus,
): Promise<TargetCustomer> {
  await dbConnect();
  const customer = await TargetCustomerModel.findOne({ _id: id, workspaceId });
  if (!customer) throw new CustomerNotFoundError("That customer doesn't exist in this workspace.");
  customer.status = status;
  await customer.save();
  return customer.toObject() as TargetCustomer;
}

/** How many TargetCustomer rows trace back to a given DiscoveryRun — for the Discovery Run detail page. */
export async function countCustomersForRun(workspaceId: string, discoveryRunId: string): Promise<number> {
  await dbConnect();
  return TargetCustomerModel.countDocuments({ workspaceId, discoveryRunId });
}

export type CustomerDashboardStats = {
  total: number;
  newToday: number;
  aPlusCount: number;
  byPriority: Record<string, number>;
  byCountry: { country: string; count: number }[];
  recent: TargetCustomer[];
};

/** Aggregated counts for the dashboard's customer summary section. */
export async function getCustomerDashboardStats(workspaceId: string): Promise<CustomerDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, newToday, aPlusCount, priorityAgg, countryAgg, recentDocs] = await Promise.all([
    TargetCustomerModel.countDocuments({ workspaceId }),
    TargetCustomerModel.countDocuments({ workspaceId, createdAt: { $gte: startOfToday } }),
    TargetCustomerModel.countDocuments({ workspaceId, priority: "A_PLUS" }),
    TargetCustomerModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    TargetCustomerModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    TargetCustomerModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(5),
  ]);

  const byPriority: Record<string, number> = {};
  for (const row of priorityAgg as { _id: string | null; count: number }[]) {
    byPriority[row._id ?? "UNSCORED"] = row.count;
  }

  return {
    total,
    newToday,
    aPlusCount,
    byPriority,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    recent: recentDocs.map((r) => r.toObject() as TargetCustomer),
  };
}
