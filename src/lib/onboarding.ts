import "server-only";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/mongodb";
import { WorkspaceOnboarding } from "@/models";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";
import { ONBOARDING_STEPS } from "@/config/onboarding";

export type OnboardingStepSlug = (typeof ONBOARDING_STEPS)[number]["slug"];

export function stepPath(slug: OnboardingStepSlug) {
  return `/onboarding/${slug}`;
}

function stepNumberFor(slug: OnboardingStepSlug) {
  return ONBOARDING_STEPS.find((s) => s.slug === slug)!.step;
}

function slugForStep(step: number): OnboardingStepSlug {
  const found = ONBOARDING_STEPS.find((s) => s.step === step) ?? ONBOARDING_STEPS[0];
  return found.slug;
}

/** Fetches (creating if needed) the onboarding row for a workspace. */
export async function getOrCreateOnboarding(workspaceId: string): Promise<WorkspaceOnboarding> {
  await dbConnect();
  const existing = await WorkspaceOnboarding.findOne({ workspaceId });
  if (existing) return existing;

  return WorkspaceOnboarding.create({
    workspaceId,
    status: "NOT_STARTED",
    currentStep: 1,
    startedAt: new Date(),
  });
}

/** Read-only check used to gate the dashboard — does not create a row. */
export async function isOnboardingComplete(workspaceId: string): Promise<boolean> {
  await dbConnect();
  const onboarding = await WorkspaceOnboarding.findOne({ workspaceId }, { status: 1 });
  return onboarding?.status === "COMPLETED";
}

export type OnboardingStatusSummary = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentStep: number;
  currentStepSlug: OnboardingStepSlug;
  totalSteps: number;
};

/**
 * Read-only status summary for a workspace's onboarding — does not create a
 * row (a workspace that's never started onboarding reads as NOT_STARTED at
 * step 1, not a 404). The "Get onboarding status" query surfaced to callers
 * that just need to know where a workspace stands, without the redirect
 * side effects of requireOnboardingStep.
 */
export async function getOnboardingStatus(workspaceId: string): Promise<OnboardingStatusSummary> {
  await dbConnect();
  const onboarding = await WorkspaceOnboarding.findOne({ workspaceId });
  const currentStep = onboarding?.currentStep ?? 1;
  return {
    status: onboarding?.status ?? "NOT_STARTED",
    currentStep,
    currentStepSlug: slugForStep(currentStep),
    totalSteps: ONBOARDING_STEPS.length,
  };
}

/**
 * Shared guard for every onboarding step page: requires a session and an
 * active workspace, ensures an onboarding row exists, and redirects to
 * `/dashboard` if it's already complete or to the correct step if the
 * requested one is ahead of where the workspace actually is.
 */
export async function requireOnboardingStep(requestedSlug: OnboardingStepSlug) {
  const active: ActiveWorkspace = await requireActiveWorkspace();
  const onboarding = await getOrCreateOnboarding(active.workspace.id);

  if (onboarding.status === "COMPLETED") {
    redirect("/dashboard");
  }

  const requestedStep = stepNumberFor(requestedSlug);
  if (requestedStep > onboarding.currentStep) {
    redirect(stepPath(slugForStep(onboarding.currentStep)));
  }

  return { active, onboarding };
}
