import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ProjectOpportunity as ProjectOpportunityModel } from "@/models";
import type { ProjectOpportunity } from "@/models";
import { normalizeCompanyName, normalizeAddress, normalizeUrl } from "@/lib/dedup/normalize";

// Re-exported under project-domain names for clarity at call sites — same
// canonical implementations as src/lib/customers/duplicate.ts uses, from
// src/lib/dedup/normalize.ts (Phase 8).
export const normalizeClientName = normalizeCompanyName;
export const normalizeProjectName = normalizeAddress;
export const normalizeLocation = normalizeAddress;

/**
 * Same project-information link in the same workspace is a strong signal of
 * "same project" — keyed on the normalized link alone. Falling back to
 * clientName+projectName+location when no link is available is a weaker
 * signal (kept as a separate key so the two never collide).
 */
export function buildProjectDuplicateKey(
  workspaceId: string,
  projectName: string,
  clientName: string,
  location: string,
  projectInformationLink: string,
): string {
  const link = normalizeUrl(projectInformationLink);
  if (link) return `${workspaceId}:link:${link}`;
  return `${workspaceId}:name:${normalizeClientName(clientName)}:${normalizeProjectName(projectName)}:${normalizeLocation(location).trim()}`;
}

/** Same projectInformationLink (or sourceUrl, if that's all we have), same workspace = the same project — the processor treats this as an update, never a new row. */
export async function detectExistingProjectByLink(workspaceId: string, link: string): Promise<ProjectOpportunity | null> {
  const normalizedLink = normalizeUrl(link);
  if (!normalizedLink) return null;

  await dbConnect();
  const candidates = await ProjectOpportunityModel.find({ workspaceId, projectInformationLink: { $ne: null } });
  const match = candidates.find((c) => normalizeUrl(c.projectInformationLink ?? "") === normalizedLink);
  return match ? (match.toObject() as ProjectOpportunity) : null;
}

/** Weaker signal than link — matching normalized clientName + projectName + location flags a possible duplicate for human review rather than an automatic update. */
export async function detectExistingProjectByNameOwnerLocation(
  workspaceId: string,
  projectName: string,
  clientName: string,
  location: string,
): Promise<ProjectOpportunity | null> {
  const normalizedProjectName = normalizeProjectName(projectName);
  const normalizedClientName = normalizeClientName(clientName);
  if (!normalizedProjectName || !normalizedClientName) return null;

  await dbConnect();
  const candidates = await ProjectOpportunityModel.find({ workspaceId, location: location || null });
  const match = candidates.find(
    (c) => normalizeProjectName(c.projectName) === normalizedProjectName && normalizeClientName(c.clientName) === normalizedClientName,
  );
  return match ? (match.toObject() as ProjectOpportunity) : null;
}
