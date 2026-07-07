"use client";

import { useTransition } from "react";
import { startAnalysis } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";

export function StartAnalysisForm() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => startAnalysis())}
      className="mt-2"
    >
      {isPending ? "Starting..." : "Start analysis"}
    </Button>
  );
}
