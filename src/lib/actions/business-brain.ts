"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canReviewBrainFacts } from "@/lib/access-control";
import { markFactVerification, recordFeedback, BrainFactNotFoundError, BrainFeedbackTargetError } from "@/lib/business-brain/service";
import type { BrainFactVerificationStatus, BrainFeedbackType } from "@/generated/prisma/client";

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
