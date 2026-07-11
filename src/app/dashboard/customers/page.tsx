import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Customers"
      description="Target customers surfaced through continuous global discovery from public online sources, matched against your Business Brain."
      emptyDescription="Customer discovery isn't built yet. A basic version exists in the backend (TargetCompany) but isn't wired to a scheduled job or this page yet."
    />
  );
}
