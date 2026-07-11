import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Discovery Brain" };

export default async function DiscoveryBrainPage() {
  await requireActiveWorkspace();
  return (
    <ComingSoonPage
      title="Discovery Brain"
      description="Turns your Business Brain into search queries that drive continuous global discovery from public online sources."
      emptyDescription="Query generation exists in the backend (src/lib/search-queries) but isn't surfaced here yet. This page will show generated queries and let you run them on demand."
    />
  );
}
