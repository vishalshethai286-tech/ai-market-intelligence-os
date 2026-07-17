import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Download links for a data-export API route (see src/app/api/export/*). */
export function ExportLinks({ href }: { href: string }) {
  return (
    <div className="flex items-center gap-2">
      <a href={`${href}?format=json`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Export JSON
      </a>
      <a href={`${href}?format=csv`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Export Excel
      </a>
    </div>
  );
}
