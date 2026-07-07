import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { canEditCompanyProfile } from "@/lib/access-control";
import { getCompanyProfile } from "@/lib/company-profile/service";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { CompanyProfileForm } from "@/components/company-profile/company-profile-form";
import { RegenerateButton } from "@/components/company-profile/regenerate-button";
import { ContinueButton } from "./continue-button";

export const metadata: Metadata = {
  title: "Review company profile",
};

export default async function ReviewProfilePage() {
  const { active } = await requireOnboardingStep("review-profile");
  const canEdit = canEditCompanyProfile(active.role);
  const profile = await getCompanyProfile(active.workspace.id);

  return (
    <div>
      <OnboardingProgress currentStep={6} />

      <h1 className="text-xl font-semibold tracking-tight">Review your company profile</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        We built this from your website. Edit anything that&apos;s off and approve it, or continue and review it
        later from the dashboard.
      </p>

      {!profile && (
        <div className="mt-6 rounded-xl border border-black/[.08] p-6 text-sm dark:border-white/[.145]">
          <p className="text-black/70 dark:text-white/70">
            We couldn&apos;t generate a profile from your website. You can try again, or continue without one.
          </p>
          {canEdit && <RegenerateButton label="Try again" className="mt-3" />}
        </div>
      )}

      {profile && (
        <div className="mt-6">
          <CompanyProfileForm profile={profile} canEdit={canEdit} />
        </div>
      )}

      <ContinueButton />
    </div>
  );
}
