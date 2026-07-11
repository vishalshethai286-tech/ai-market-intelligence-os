import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Live Tenders" };

export default async function LiveTendersPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Live Tenders"
      description="Open public tenders and RFPs matching your products/services and target countries, found via continuous global discovery from public online sources."
      emptyDescription="Tender discovery isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
