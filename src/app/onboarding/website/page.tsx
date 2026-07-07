import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { WebsiteForm } from "./website-form";

export const metadata: Metadata = {
  title: "Company website",
};

export default async function OnboardingWebsitePage() {
  const { onboarding } = await requireOnboardingStep("website");

  return (
    <div>
      <OnboardingProgress currentStep={1} />

      <h1 className="text-xl font-semibold tracking-tight">What&apos;s your company website?</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        We&apos;ll use this to tailor market intelligence for your business.
      </p>

      <div className="mt-6">
        <WebsiteForm defaultValue={onboarding.companyWebsite ?? undefined} />
      </div>
    </div>
  );
}
