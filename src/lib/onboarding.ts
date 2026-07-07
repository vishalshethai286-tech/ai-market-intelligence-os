import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
export async function getOrCreateOnboarding(workspaceId: string) {
  const existing = await prisma.workspaceOnboarding.findUnique({ where: { workspaceId } });
  if (existing) return existing;

  return prisma.workspaceOnboarding.create({
    data: { workspaceId, status: "NOT_STARTED", currentStep: 1, startedAt: new Date() },
  });
}

/** Read-only check used to gate the dashboard — does not create a row. */
export async function isOnboardingComplete(workspaceId: string): Promise<boolean> {
  const onboarding = await prisma.workspaceOnboarding.findUnique({
    where: { workspaceId },
    select: { status: true },
  });
  return onboarding?.status === "COMPLETED";
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
