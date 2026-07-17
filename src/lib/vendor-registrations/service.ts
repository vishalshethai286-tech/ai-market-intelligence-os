import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { VendorRegistration as VendorRegistrationModel } from "@/models";
import type { VendorRegistration, VendorRegistrationStatus } from "@/models";

export class VendorRegistrationNotFoundError extends Error {}

export type VendorRegistrationFilters = {
  q?: string;
  country?: string;
  status?: string;
  duplicateStatus?: string;
  registrationType?: string;
  sortBy?: "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated VendorRegistrations for a workspace, for the Vendor Registrations page. */
export async function listVendorRegistrations(workspaceId: string, filters: VendorRegistrationFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.country) query.country = filters.country;
  if (filters.status) query.status = filters.status;
  if (filters.duplicateStatus) query.duplicateStatus = filters.duplicateStatus;
  if (filters.registrationType) query.registrationType = filters.registrationType;
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ customerName: regex }, { website: regex }, { websiteDomain: regex }, { country: regex }];
  }

  const [total, rows] = await Promise.all([
    VendorRegistrationModel.countDocuments(query),
    VendorRegistrationModel.find(query)
      .sort({ createdAt: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    registrations: rows.map((r) => r.toObject() as VendorRegistration),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getVendorRegistration(workspaceId: string, id: string): Promise<VendorRegistration> {
  await dbConnect();
  const registration = await VendorRegistrationModel.findOne({ _id: id, workspaceId });
  if (!registration) throw new VendorRegistrationNotFoundError("That vendor registration doesn't exist in this workspace.");
  return registration.toObject() as VendorRegistration;
}

export async function updateVendorRegistrationStatus(
  workspaceId: string,
  id: string,
  status: VendorRegistrationStatus,
): Promise<VendorRegistration> {
  await dbConnect();
  const registration = await VendorRegistrationModel.findOne({ _id: id, workspaceId });
  if (!registration) throw new VendorRegistrationNotFoundError("That vendor registration doesn't exist in this workspace.");
  registration.status = status;
  await registration.save();
  return registration.toObject() as VendorRegistration;
}

/** How many VendorRegistration rows trace back to a given DiscoveryRun — for the Discovery Run detail page. */
export async function countVendorRegistrationsForRun(workspaceId: string, discoveryRunId: string): Promise<number> {
  await dbConnect();
  return VendorRegistrationModel.countDocuments({ workspaceId, discoveryRunId });
}

/** Total VendorRegistration count for a workspace — for the dashboard's vendor registration summary. */
export async function countVendorRegistrations(workspaceId: string): Promise<number> {
  await dbConnect();
  return VendorRegistrationModel.countDocuments({ workspaceId });
}

export type VendorRegistrationDashboardStats = {
  total: number;
  newToday: number;
  byStatus: Record<string, number>;
  byCountry: { country: string; count: number }[];
  approved: number;
  submitted: number;
};

/** Aggregated counts for the dashboard's vendor registration summary section. */
export async function getVendorRegistrationDashboardStats(workspaceId: string): Promise<VendorRegistrationDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, newToday, statusAgg, countryAgg, approved, submitted] = await Promise.all([
    VendorRegistrationModel.countDocuments({ workspaceId }),
    VendorRegistrationModel.countDocuments({ workspaceId, createdAt: { $gte: startOfToday } }),
    VendorRegistrationModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    VendorRegistrationModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "APPROVED" }),
    VendorRegistrationModel.countDocuments({ workspaceId, status: "SUBMITTED" }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusAgg as { _id: string | null; count: number }[]) {
    byStatus[row._id ?? "UNKNOWN"] = row.count;
  }

  return {
    total,
    newToday,
    byStatus,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    approved,
    submitted,
  };
}
