import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { TARGET_COUNTRIES, CUSTOMER_TYPES } from "@/config/onboarding";
import { Badge } from "@/components/ui/badge";
import { StartAnalysisForm } from "./start-analysis-form";

export const metadata: Metadata = {
  title: "Start analysis",
};

function nameFor(list: readonly { code: string; name: string }[], code: string) {
  return list.find((item) => item.code === code)?.name ?? code;
}

export default async function OnboardingStartPage() {
  const { onboarding } = await requireOnboardingStep("start");

  return (
    <div>
      <OnboardingProgress currentStep={5} />

      <h1 className="text-xl font-semibold tracking-tight">Ready to analyze {onboarding.companyWebsite}</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Review your details, then start the analysis for this workspace.
      </p>

      <dl className="mt-6 flex flex-col gap-4 text-sm">
        <div>
          <dt className="font-medium">Company website</dt>
          <dd className="mt-1 text-black/60 dark:text-white/60">{onboarding.companyWebsite}</dd>
        </div>
        <div>
          <dt className="font-medium">Work email</dt>
          <dd className="mt-1 text-black/60 dark:text-white/60">{onboarding.workEmail}</dd>
        </div>
        <div>
          <dt className="font-medium">Target countries</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {onboarding.targetCountries.map((code) => (
              <Badge key={code} variant="outline">
                {nameFor(TARGET_COUNTRIES, code)}
              </Badge>
            ))}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Customer types</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {onboarding.customerTypes.map((code) => (
              <Badge key={code} variant="outline">
                {nameFor(CUSTOMER_TYPES, code)}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>

      <StartAnalysisForm />
    </div>
  );
}
