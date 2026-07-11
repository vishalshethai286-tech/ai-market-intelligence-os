import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Tender Buyers" };

export default async function TenderBuyersPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Tender Buyers"
      description="Procurement bodies and buyers worldwide who publish tenders relevant to your products and services."
      emptyDescription="Tender buyer discovery isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
