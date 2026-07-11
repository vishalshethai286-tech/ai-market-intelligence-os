import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1 p-5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
        {icon && <div className="text-black/40 dark:text-white/40">{icon}</div>}
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-black/50 dark:text-white/50">{hint}</p>}
    </Card>
  );
}
