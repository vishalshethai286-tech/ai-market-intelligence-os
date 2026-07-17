import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { TenderBuyer as TenderBuyerModel } from "@/models";
import type { TenderBuyer, TenderBuyerStatus } from "@/models";

export class TenderBuyerNotFoundError extends Error {}

export type TenderBuyerFilters = {
  q?: string;
  country?: string;
  status?: string;
  duplicateStatus?: string;
  sortBy?: "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated TenderBuyers for a workspace, for the Tender Buyers page. */
export async function listTenderBuyers(workspaceId: string, filters: TenderBuyerFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.country) query.country = filters.country;
  if (filters.status) query.status = filters.status;
  if (filters.duplicateStatus) query.duplicateStatus = filters.duplicateStatus;
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ customerName: regex }, { website: regex }, { websiteDomain: regex }, { country: regex }];
  }

  const [total, rows] = await Promise.all([
    TenderBuyerModel.countDocuments(query),
    TenderBuyerModel.find(query)
      .sort({ createdAt: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    buyers: rows.map((r) => r.toObject() as TenderBuyer),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTenderBuyer(workspaceId: string, id: string): Promise<TenderBuyer> {
  await dbConnect();
  const buyer = await TenderBuyerModel.findOne({ _id: id, workspaceId });
  if (!buyer) throw new TenderBuyerNotFoundError("That tender buyer doesn't exist in this workspace.");
  return buyer.toObject() as TenderBuyer;
}

export async function updateTenderBuyerStatus(workspaceId: string, id: string, status: TenderBuyerStatus): Promise<TenderBuyer> {
  await dbConnect();
  const buyer = await TenderBuyerModel.findOne({ _id: id, workspaceId });
  if (!buyer) throw new TenderBuyerNotFoundError("That tender buyer doesn't exist in this workspace.");
  buyer.status = status;
  await buyer.save();
  return buyer.toObject() as TenderBuyer;
}

/** How many TenderBuyer rows trace back to a given DiscoveryRun — for the Discovery Run detail page. */
export async function countTenderBuyersForRun(workspaceId: string, discoveryRunId: string): Promise<number> {
  await dbConnect();
  return TenderBuyerModel.countDocuments({ workspaceId, discoveryRunId });
}

/** Total TenderBuyer count for a workspace — for the dashboard's tender summary. */
export async function countTenderBuyers(workspaceId: string): Promise<number> {
  await dbConnect();
  return TenderBuyerModel.countDocuments({ workspaceId });
}
