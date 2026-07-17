"use client";

import { useState, useTransition } from "react";
import { createBillingPortalSessionAction } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";

export function BillingPortalButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createBillingPortalSessionAction();
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? "Opening..." : "Open billing portal"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
