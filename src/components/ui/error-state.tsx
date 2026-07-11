"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Used by route-segment `error.tsx` boundaries and inline error fallbacks. */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[30vh] flex-col items-center justify-center gap-2 rounded-xl border border-red-600/20 bg-red-600/[.03] px-6 py-12 text-center dark:border-red-400/20 dark:bg-red-400/[.03]",
        className,
      )}
    >
      <p className="font-medium text-red-700 dark:text-red-400">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-black/50 dark:text-white/50">{description}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
