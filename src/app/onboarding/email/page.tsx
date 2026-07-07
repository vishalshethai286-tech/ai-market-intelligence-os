import type { Metadata } from "next";
import { auth } from "@/auth";
import { requireOnboardingStep } from "@/lib/onboarding";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { EmailForm } from "./email-form";

export const metadata: Metadata = {
  title: "Work email",
};

export default async function OnboardingEmailPage() {
  const { onboarding } = await requireOnboardingStep("email");
  const session = await auth();

  return (
    <div>
      <OnboardingProgress currentStep={2} />

      <h1 className="text-xl font-semibold tracking-tight">What&apos;s your work email?</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        We&apos;ll send analysis updates and team invites here.
      </p>

      <div className="mt-6">
        <EmailForm defaultValue={onboarding.workEmail ?? session?.user?.email ?? undefined} />
      </div>
    </div>
  );
}
