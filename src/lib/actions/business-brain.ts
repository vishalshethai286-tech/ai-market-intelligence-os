"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canReviewBrainFacts } from "@/lib/access-control";
import {
  markFactVerification,
  recordFeedback,
  refreshBrain,
  BrainFactNotFoundError,
  BrainFeedbackTargetError,
  BrainNotReadyError,
  BrainRefreshCooldownError,
} from "@/lib/business-brain/service";
import type { BrainFactVerificationStatus, BrainFeedbackType } from "@/models";

const BRAIN_PATH = "/dashboard/business-brain";

export async function markFactVerificationAction(
  factId: string,
  status: BrainFactVerificationStatus,
): Promise<{ error?: string } | undefined> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canReviewBrainFacts(active.role)) {
    return { error: "You don't have access to review facts." };
  }

  try {
    await markFactVerification(active.workspace.id, factId, session.user.id, status);
  } catch (error) {
    if (error instanceof BrainFactNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(BRAIN_PATH);
}

export async function submitBrainFeedbackAction(
  feedbackType: BrainFeedbackType,
  target: { factId?: string; entityId?: string },
): Promise<{ error?: string } | undefined> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canReviewBrainFacts(active.role)) {
    return { error: "You don't have access to give feedback." };
  }

  try {
    await recordFeedback(active.workspace.id, session.user.id, { feedbackType, ...target });
  } catch (error) {
    if (error instanceof BrainFeedbackTargetError) return { error: error.message };
    throw error;
  }

  revalidatePath(BRAIN_PATH);
}

export type BrainRefreshSummary = { changed: boolean; created: number; updated: number; expired: number; flagged: number };

export async function refreshBrainAction(): Promise<{ error?: string; summary?: BrainRefreshSummary }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canReviewBrainFacts(active.role)) {
    return { error: "You don't have access to refresh the Business Brain." };
  }

  try {
    const result = await refreshBrain(active.workspace.id, session.user.id, "MANUAL");
    revalidatePath(BRAIN_PATH);
    if (result.error) return { error: result.error };
    return {
      summary: {
        changed: result.changed,
        created: result.created,
        updated: result.updated,
        expired: result.expired,
        flagged: result.flagged,
      },
    };
  } catch (error) {
    if (error instanceof BrainNotReadyError || error instanceof BrainRefreshCooldownError) {
      return { error: error.message };
    }
    throw error;
  }
}
