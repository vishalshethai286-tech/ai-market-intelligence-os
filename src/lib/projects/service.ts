import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ProjectOpportunity as ProjectOpportunityModel } from "@/models";
import type { ProjectOpportunity, ProjectOpportunityStatus } from "@/models";

export class ProjectNotFoundError extends Error {}

export type ProjectFilters = {
  q?: string;
  country?: string;
  projectStage?: string;
  priority?: string;
  status?: string;
  sortBy?: "score" | "createdAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Search/filter/sort/paginated ProjectOpportunities for a workspace, for the Projects page. */
export async function listProjects(workspaceId: string, filters: ProjectFilters = {}) {
  await dbConnect();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 100));
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir === "asc" ? 1 : -1;

  const query: Record<string, unknown> = { workspaceId };
  if (filters.country) query.country = filters.country;
  if (filters.projectStage) query.projectStage = filters.projectStage;
  if (filters.priority) query.priority = filters.priority;
  if (filters.status) query.status = filters.status;
  if (filters.q) {
    const regex = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ clientName: regex }, { projectName: regex }, { location: regex }, { contractorName: regex }];
  }

  const [total, rows] = await Promise.all([
    ProjectOpportunityModel.countDocuments(query),
    ProjectOpportunityModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  return {
    projects: rows.map((r) => r.toObject() as ProjectOpportunity),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getProject(workspaceId: string, id: string): Promise<ProjectOpportunity> {
  await dbConnect();
  const project = await ProjectOpportunityModel.findOne({ _id: id, workspaceId });
  if (!project) throw new ProjectNotFoundError("That project doesn't exist in this workspace.");
  return project.toObject() as ProjectOpportunity;
}

export async function updateProjectStatus(
  workspaceId: string,
  id: string,
  status: ProjectOpportunityStatus,
): Promise<ProjectOpportunity> {
  await dbConnect();
  const project = await ProjectOpportunityModel.findOne({ _id: id, workspaceId });
  if (!project) throw new ProjectNotFoundError("That project doesn't exist in this workspace.");
  project.status = status;
  await project.save();
  return project.toObject() as ProjectOpportunity;
}

/** How many ProjectOpportunity rows trace back to a given DiscoveryRun — for the Discovery Run detail page. */
export async function countProjectsForRun(workspaceId: string, discoveryRunId: string): Promise<number> {
  await dbConnect();
  return ProjectOpportunityModel.countDocuments({ workspaceId, discoveryRunId });
}

export type ProjectDashboardStats = {
  total: number;
  newToday: number;
  aPlusCount: number;
  byPriority: Record<string, number>;
  byCountry: { country: string; count: number }[];
  byStage: Record<string, number>;
  recent: ProjectOpportunity[];
};

/** Aggregated counts for the dashboard's project summary section — same shape as customers/service.ts's getCustomerDashboardStats, plus a by-stage breakdown. */
export async function getProjectDashboardStats(workspaceId: string): Promise<ProjectDashboardStats> {
  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, newToday, aPlusCount, priorityAgg, countryAgg, stageAgg, recentDocs] = await Promise.all([
    ProjectOpportunityModel.countDocuments({ workspaceId }),
    ProjectOpportunityModel.countDocuments({ workspaceId, createdAt: { $gte: startOfToday } }),
    ProjectOpportunityModel.countDocuments({ workspaceId, priority: "A_PLUS" }),
    ProjectOpportunityModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    ProjectOpportunityModel.aggregate([
      { $match: { workspaceId, country: { $nin: [null, ""] } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    ProjectOpportunityModel.aggregate([{ $match: { workspaceId } }, { $group: { _id: "$projectStage", count: { $sum: 1 } } }]),
    ProjectOpportunityModel.find({ workspaceId }).sort({ createdAt: -1 }).limit(5),
  ]);

  const byPriority: Record<string, number> = {};
  for (const row of priorityAgg as { _id: string | null; count: number }[]) {
    byPriority[row._id ?? "UNSCORED"] = row.count;
  }

  const byStage: Record<string, number> = {};
  for (const row of stageAgg as { _id: string | null; count: number }[]) {
    byStage[row._id ?? "UNKNOWN"] = row.count;
  }

  return {
    total,
    newToday,
    aPlusCount,
    byPriority,
    byCountry: (countryAgg as { _id: string; count: number }[]).map((row) => ({ country: row._id, count: row.count })),
    byStage,
    recent: recentDocs.map((r) => r.toObject() as ProjectOpportunity),
  };
}
