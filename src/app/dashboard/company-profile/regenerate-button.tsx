"use client";

import { useState, useTransition } from "react";
import { regenerateCompanyProfileAction } from "@/lib/actions/company-profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function RegenerateButton({
  label = "Regenerate",
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
            const result = await regenerateCompanyProfileAction();
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? "Generating..." : label}
      </Button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
