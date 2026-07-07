"use client";

import { useTransition } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";

export function FinishButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => completeOnboarding())}
      className="mt-6"
    >
      {isPending ? "Finishing..." : "Finish and go to dashboard"}
    </Button>
  );
}
