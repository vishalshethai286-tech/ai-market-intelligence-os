"use client";

import { useState, useTransition } from "react";
import { createCheckoutSessionAction } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import type { PlanKey } from "@/models";

export function UpgradeButton({ planKey, label }: { planKey: PlanKey; label: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createCheckoutSessionAction(planKey);
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? "Starting checkout..." : label}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
