"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { processProjectResults, type ProcessProjectResultsOptions } from "@/lib/projects/processor";
import { updateProjectStatus, ProjectNotFoundError } from "@/lib/projects/service";
import { recordFeedback, BrainFeedbackTargetError } from "@/lib/business-brain/service";
import { dbConnect } from "@/lib/mongodb";
import { ProjectOpportunity as ProjectOpportunityModel } from "@/models";
import type { ProjectOpportunityStatus } from "@/models";

function revalidateProjectPaths() {
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/discovery-runs");
  revalidatePath("/dashboard/raw-search-results");
  revalidatePath("/dashboard");
}

export type ProcessProjectResultsActionResult =
  | {
      ok: true;
      rawResultsProcessed: number;
      projectsCreated: number;
      projectsUpdated: number;
      skipped: number;
      failed: number;
      duplicatesFound: number;
      autoMerged: number;
      pendingReview: number;
    }
  | { ok: false; error: string };

/** "Process Project Results" — turns queued RawSearchResult (searchType=PROJECT) rows into ProjectOpportunity records. */
export async function processProjectResultsAction(
  input: ProcessProjectResultsOptions = {},
): Promise<ProcessProjectResultsActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to process project results." };
  }

  try {
    const summary = await processProjectResults(active.workspace.id, input);
    revalidateProjectPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't process project results right now. Please try again." };
  }
}

export type UpdateProjectStatusActionResult = { ok: true } | { ok: false; error: string };

export async function updateProjectStatusAction(
  id: string,
  status: ProjectOpportunityStatus,
): Promise<UpdateProjectStatusActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update projects." };
  }

  try {
    await updateProjectStatus(active.workspace.id, id, status);
    revalidateProjectPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ProjectNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that project right now. Please try again." };
  }
}

export type ProjectFeedbackKind = "HIGH_POTENTIAL" | "NOT_RELEVANT" | "WATCHING" | "CONTACTED";

/**
 * Mark High Potential / Not Relevant / Watching / Contacted. High
 * Potential/Not Relevant map onto the existing BrainFeedback vocabulary
 * (GOOD_LEAD/BAD_LEAD) — same pattern as recordCustomerFeedbackAction.
 * Watching/Contacted have no compatible BrainFeedback type, so they're just
 * status changes.
 */
export async function recordProjectFeedbackAction(
  id: string,
  kind: ProjectFeedbackKind,
): Promise<UpdateProjectStatusActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to give feedback on projects." };
  }

  await dbConnect();
  const project = await ProjectOpportunityModel.findOne({ _id: id, workspaceId: active.workspace.id });
  if (!project) {
    return { ok: false, error: "That project doesn't exist in this workspace." };
  }

  if (kind === "WATCHING" || kind === "CONTACTED") {
    project.status = kind;
    await project.save();
    revalidateProjectPaths();
    return { ok: true };
  }

  try {
    await recordFeedback(active.workspace.id, session.user.id, {
      feedbackType: kind === "HIGH_POTENTIAL" ? "GOOD_LEAD" : "BAD_LEAD",
      subjectLabel: project.projectName,
    });
  } catch (error) {
    // No Business Brain yet — still safe to record the status change, just without the brain-feedback signal.
    if (!(error instanceof BrainFeedbackTargetError)) throw error;
  }

  project.status = kind === "HIGH_POTENTIAL" ? "APPROVED" : "REJECTED";
  await project.save();
  revalidateProjectPaths();
  return { ok: true };
}
