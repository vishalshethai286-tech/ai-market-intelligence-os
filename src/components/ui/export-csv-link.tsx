import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Plain link to a `/api/export/*` route — the browser handles the download via the route's Content-Disposition header, no client JS needed. */
export function ExportCsvLink({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}>
      Export CSV
    </a>
  );
}
