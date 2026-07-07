import * as React from "react";
import { cn } from "@/lib/cn";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-black/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:focus:border-white/40",
          className,
        )}
        {...props}
      />
    );
  },
);
Select.displayName = "Select";
