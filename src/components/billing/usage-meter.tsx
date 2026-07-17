import { cn } from "@/lib/cn";

/** One row of a usage bar: label, current/limit counts, and a filled bar — unlimited metrics (limit=null) show "Unlimited" with no bar. */
export function UsageMeter({
  label,
  current,
  limit,
  percentUsed,
}: {
  label: string;
  current: number;
  limit: number | null;
  percentUsed: number | null;
}) {
  const clamped = percentUsed === null ? 0 : Math.min(100, percentUsed);
  const isNearLimit = percentUsed !== null && percentUsed >= 80;
  const isOverLimit = percentUsed !== null && percentUsed >= 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-black/70 dark:text-white/70">{label}</span>
        <span className="text-black/50 dark:text-white/50">
          {limit === null ? `${current.toLocaleString()} · Unlimited` : `${current.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              isOverLimit ? "bg-red-600 dark:bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-black/60 dark:bg-white/60",
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
      )}
    </div>
  );
}
