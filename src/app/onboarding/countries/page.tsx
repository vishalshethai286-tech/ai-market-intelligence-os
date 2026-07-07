import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { CountriesForm } from "./countries-form";

export const metadata: Metadata = {
  title: "Target countries",
};

export default async function OnboardingCountriesPage() {
  const { onboarding } = await requireOnboardingStep("countries");

  return (
    <div>
      <OnboardingProgress currentStep={3} />

      <h1 className="text-xl font-semibold tracking-tight">Which countries do you sell into?</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Select every market you want covered — you can change this later.
      </p>

      <div className="mt-6">
        <CountriesForm defaultValue={onboarding.targetCountries} />
      </div>
    </div>
  );
}
