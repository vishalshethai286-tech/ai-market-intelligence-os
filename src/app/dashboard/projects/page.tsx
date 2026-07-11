import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Projects"
      description="Active and upcoming projects worth pursuing, found via continuous global discovery from public online sources."
      emptyDescription="Project discovery isn't built yet — see PRODUCT_VISION.md for the plan."
    />
  );
}
