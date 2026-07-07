import { redirect } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { getOrCreateOnboarding, stepPath } from "@/lib/onboarding";
import { ONBOARDING_STEPS } from "@/config/onboarding";

export default async function OnboardingIndexPage() {
  const active = await requireActiveWorkspace();
  const onboarding = await getOrCreateOnboarding(active.workspace.id);

  if (onboarding.status === "COMPLETED") {
    redirect("/dashboard");
  }

  const step = ONBOARDING_STEPS.find((s) => s.step === onboarding.currentStep) ?? ONBOARDING_STEPS[0];
  redirect(stepPath(step.slug));
}
