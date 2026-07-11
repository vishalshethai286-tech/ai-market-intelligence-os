import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Duplicates" };

export default async function DuplicatesPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Duplicates"
      description="Opportunities discovered more than once across runs and sources, merged into a single record with provenance preserved."
      emptyDescription="Continuous deduplication isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
