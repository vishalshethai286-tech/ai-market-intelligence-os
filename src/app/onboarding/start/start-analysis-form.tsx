"use client";

import { useTransition } from "react";
import { startAnalysis } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

export function StartAnalysisForm() {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => startAnalysis())}
        className="mt-2"
      >
        {isPending && <Spinner />}
        {isPending ? "Analyzing your website..." : "Start analysis"}
      </Button>
      {isPending && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Fetching your homepage, building your company profile, and finding your products/services — this can take
          up to about 30 seconds.
        </p>
      )}
    </div>
  );
}
