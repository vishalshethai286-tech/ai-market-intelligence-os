import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { CustomerTypesForm } from "./customer-types-form";

export const metadata: Metadata = {
  title: "Customer types",
};

export default async function OnboardingCustomerTypesPage() {
  const { onboarding } = await requireOnboardingStep("customer-types");

  return (
    <div>
      <OnboardingProgress currentStep={4} />

      <h1 className="text-xl font-semibold tracking-tight">Who are your customers?</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Select the customer types you sell to, so we can focus the analysis.
      </p>

      <div className="mt-6">
        <CustomerTypesForm defaultValue={onboarding.customerTypes} />
      </div>
    </div>
  );
}
