import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditProductCatalog } from "@/lib/access-control";
import { listProductServices } from "@/lib/product-discovery/service";
import { getLatestAnalysis } from "@/lib/website-analysis";
import { ProductServiceCard } from "@/components/product-discovery/product-service-card";
import { RegenerateButton } from "@/components/product-discovery/regenerate-button";

export const metadata: Metadata = {
  title: "Products & Services",
};

export default async function ProductsPage() {
  const active = await requireActiveWorkspace();
  const canEdit = canEditProductCatalog(active.role);

  const [records, latestAnalysis] = await Promise.all([
    listProductServices(active.workspace.id),
    getLatestAnalysis(active.workspace.id),
  ]);

  const hasCompletedAnalysis = latestAnalysis?.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products & Services</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            AI-discovered from your website content. Review and edit before approving.
          </p>
        </div>
        {canEdit && records.length > 0 && (
          <RegenerateButton label="Re-run discovery" />
        )}
      </div>

      {records.length === 0 && (
        <div className="mt-8 rounded-xl border border-black/[.08] p-6 text-sm dark:border-white/[.145]">
          {hasCompletedAnalysis ? (
            <>
              <p className="text-black/70 dark:text-white/70">
                No products or services discovered yet. Run discovery against your latest website analysis.
              </p>
              {canEdit ? (
                <RegenerateButton label="Run discovery" className="mt-3" />
              ) : (
                <p className="mt-3 text-black/50 dark:text-white/50">
                  Ask an owner, admin, or sales user to run discovery.
                </p>
              )}
            </>
          ) : (
            <p className="text-black/70 dark:text-white/70">
              Run a website analysis first — product/service discovery is built from that content. You can start one
              from onboarding, or by re-entering your company website.
            </p>
          )}
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {records.map((record) => (
            <ProductServiceCard key={record.id} record={record} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
