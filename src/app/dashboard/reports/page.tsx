import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Reports"
      description="Exportable summaries of discovered opportunities for this workspace."
      emptyDescription="Reports and exports aren't built yet — no storage integration is wired in either (see PROJECT_STATUS.md)."
    />
  );
}
