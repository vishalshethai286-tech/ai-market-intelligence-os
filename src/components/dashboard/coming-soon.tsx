import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

/** Shared shell for sidebar sections whose discovery logic isn't built yet (see PROJECT_STATUS.md). */
export function ComingSoonPage({
  title,
  description,
  emptyDescription,
}: {
  title: string;
  description: string;
  emptyDescription: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={title} description={description} />
      <EmptyState title="Coming soon" description={emptyDescription} />
    </div>
  );
}
