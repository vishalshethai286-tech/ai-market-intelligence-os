import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Vendor Registrations" };

export default async function VendorRegistrationsPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Vendor Registrations"
      description="Vendor/supplier registration portals and pre-qualification programs relevant to your countries and industries."
      emptyDescription="Vendor registration discovery isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
