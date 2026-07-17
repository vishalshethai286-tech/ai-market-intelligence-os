import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditProductCatalog } from "@/lib/access-control";
import { getProductService } from "@/lib/product-discovery/service";
import { ProductServiceCard } from "@/components/product-discovery/product-service-card";

export const metadata: Metadata = {
  title: "Product / service detail",
};

export default async function ProductServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();
  const canEdit = canEditProductCatalog(active.role);

  const record = await getProductService(active.workspace.id, id);
  if (!record) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/products"
        className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50"
      >
        &larr; Back to Products & Services
      </Link>

      <div className="mt-4">
        <ProductServiceCard record={record} canEdit={canEdit} />
      </div>
    </div>
  );
}
