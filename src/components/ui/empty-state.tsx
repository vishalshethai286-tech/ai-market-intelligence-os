import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[30vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/[.12] px-6 py-12 text-center dark:border-white/[.15]",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-black/50 dark:text-white/50">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
