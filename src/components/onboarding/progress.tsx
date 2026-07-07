import { ONBOARDING_STEPS } from "@/config/onboarding";
import { cn } from "@/lib/cn";

export function OnboardingProgress({ currentStep }: { currentStep: number }) {
  const total = ONBOARDING_STEPS.length;

  return (
    <div className="mb-8">
      <p className="mb-2 text-xs font-medium text-black/50 dark:text-white/50">
        Step {currentStep} of {total} &middot;{" "}
        {ONBOARDING_STEPS.find((s) => s.step === currentStep)?.label}
      </p>
      <div className="flex gap-1.5">
        {ONBOARDING_STEPS.map((s) => (
          <div
            key={s.slug}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-black/[.08] dark:bg-white/[.145]",
              s.step <= currentStep && "bg-foreground dark:bg-foreground",
            )}
          />
        ))}
      </div>
    </div>
  );
}
