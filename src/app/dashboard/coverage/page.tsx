import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Coverage" };

export default async function CoveragePage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Coverage"
      description="What's been searched and found so far, by country, sector, and opportunity type — discovery is continuous, not instant or guaranteed-complete."
      emptyDescription="The coverage dashboard isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
