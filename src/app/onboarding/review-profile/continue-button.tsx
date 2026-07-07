"use client";

import { useTransition } from "react";
import { continueToReviewProducts } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";

export function ContinueButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => continueToReviewProducts())}
      className="mt-6"
    >
      {isPending ? "Continuing..." : "Continue"}
    </Button>
  );
}
