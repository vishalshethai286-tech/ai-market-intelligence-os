"use client";

import { useState, useTransition } from "react";
import { regenerateProductDiscoveryAction } from "@/lib/actions/product-discovery";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function RegenerateButton({
  label = "Run discovery",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await regenerateProductDiscoveryAction();
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? "Discovering..." : label}
      </Button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
