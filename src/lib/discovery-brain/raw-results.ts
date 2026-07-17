import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { RawSearchResult as RawSearchResultModel } from "@/models";

export type RawSearchResultFilters = {
  q?: string;
  searchType?: string;
  country?: string;
  sourceProvider?: string;
  processedStatus?: string;
  extractionStatus?: string;
  page?: number;
  pageSize?: number;
};

/** Search/filter/paginated Raw Search Results for a workspace, for the Raw Search Results page. */
export async function listRawSearchResults(workspaceId: string, filters: RawSearchResultFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));

  const query: Record<string, unknown> = { workspaceId };
  if (filters.searchType) query.searchType = filters.searchType;
  if (filters.country) query.country = filters.country;
  if (filters.sourceProvider) query.sourceProvider = filters.sourceProvider;
  if (filters.processedStatus) query.processedStatus = filters.processedStatus;
  if (filters.extractionStatus) query.extractionStatus = filters.extractionStatus;
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ title: regex }, { snippet: regex }, { query: regex }, { domain: regex }];
  }

  const [total, rows] = await Promise.all([
    RawSearchResultModel.countDocuments(query),
    RawSearchResultModel.find(query)
      .sort({ retrievedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    results: rows.map((r) => r.toObject()),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
