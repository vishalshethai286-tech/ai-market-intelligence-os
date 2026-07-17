"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import {
  createContactTask,
  updateContactTask,
  completeContactTask,
  generateRecommendedContactTasks,
  generateMissingContactTasksForWorkspace,
  ContactTaskNotFoundError,
} from "@/lib/contacts/tasks";
import type { CreateContactTaskInput, UpdateContactTaskInput } from "@/lib/contacts/tasks";

function revalidateContactTaskPaths() {
  revalidatePath("/dashboard/contact-tasks");
  revalidatePath("/dashboard/contacts");
  revalidatePath("/dashboard");
}

export type ContactTaskActionResult = { ok: true; taskId?: string } | { ok: false; error: string };

export async function createContactTaskAction(input: CreateContactTaskInput): Promise<ContactTaskActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to create contact tasks." };
  }

  try {
    const session = await auth();
    const task = await createContactTask(active.workspace.id, { ...input, createdBy: session?.user?.id });
    revalidateContactTaskPaths();
    return { ok: true, taskId: task.id };
  } catch (error) {
    if (error instanceof ContactTaskNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't create that task right now. Please try again." };
  }
}

export async function updateContactTaskAction(taskId: string, input: UpdateContactTaskInput): Promise<ContactTaskActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contact tasks." };
  }

  try {
    await updateContactTask(active.workspace.id, taskId, input);
    revalidateContactTaskPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactTaskNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't update that task right now. Please try again." };
  }
}

export async function completeContactTaskAction(taskId: string): Promise<ContactTaskActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to update contact tasks." };
  }

  try {
    await completeContactTask(active.workspace.id, taskId);
    revalidateContactTaskPaths();
    return { ok: true };
  } catch (error) {
    if (error instanceof ContactTaskNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't complete that task right now. Please try again." };
  }
}

export type GenerateRecommendedContactTasksActionResult = { ok: true; created: boolean } | { ok: false; error: string };

/** "Create Recommended Tasks" on a Contact detail page — generates (at most) one task for that contact based on its current recommendedAction. */
export async function generateRecommendedContactTasksAction(contactId: string): Promise<GenerateRecommendedContactTasksActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to create contact tasks." };
  }

  try {
    const task = await generateRecommendedContactTasks(active.workspace.id, contactId);
    revalidateContactTaskPaths();
    return { ok: true, created: task !== null };
  } catch (error) {
    if (error instanceof ContactTaskNotFoundError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't generate a recommended task right now. Please try again." };
  }
}

export type GenerateMissingContactTasksActionResult = { ok: true; perContactTasksCreated: number; entityLevelTasksCreated: number } | { ok: false; error: string };

/** Workspace-wide "Generate Recommended Tasks" sweep — for the Contact Tasks page. */
export async function generateMissingContactTasksForWorkspaceAction(): Promise<GenerateMissingContactTasksActionResult> {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) {
    return { ok: false, error: "You don't have access to generate contact tasks." };
  }

  try {
    const summary = await generateMissingContactTasksForWorkspace(active.workspace.id);
    revalidateContactTaskPaths();
    return { ok: true, ...summary };
  } catch {
    return { ok: false, error: "Couldn't generate recommended tasks right now. Please try again." };
  }
}
