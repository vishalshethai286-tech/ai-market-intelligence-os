import type { Metadata } from "next";
import { requireOnboardingStep } from "@/lib/onboarding";
import { canEditProductCatalog } from "@/lib/access-control";
import { listProductServices } from "@/lib/product-discovery/service";
import { OnboardingProgress } from "@/components/onboarding/progress";
import { ProductServiceCard } from "@/components/product-discovery/product-service-card";
import { RegenerateButton } from "@/components/product-discovery/regenerate-button";
import { AddProductServiceDialog } from "@/components/product-discovery/add-product-service-dialog";
import { FinishButton } from "./finish-button";

export const metadata: Metadata = {
  title: "Review products & services",
};

export default async function ReviewProductsPage() {
  const { active } = await requireOnboardingStep("review-products");
  const canEdit = canEditProductCatalog(active.role);
  const records = await listProductServices(active.workspace.id);

  return (
    <div>
      <OnboardingProgress currentStep={7} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Review products & services</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            We found these on your website. Edit, approve, or reject anything before finishing setup — or add one
            we missed.
          </p>
        </div>
        {canEdit && <AddProductServiceDialog />}
      </div>

      {records.length === 0 && (
        <div className="mt-6 rounded-xl border border-black/[.08] p-6 text-sm dark:border-white/[.145]">
          <p className="text-black/70 dark:text-white/70">
            We didn&apos;t discover any products or services from your website. You can try again, add one manually,
            or continue without any.
          </p>
          {canEdit && <RegenerateButton label="Try again" className="mt-3" />}
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {records.map((record) => (
            <ProductServiceCard key={record.id} record={record} canEdit={canEdit} />
          ))}
        </div>
      )}

      <FinishButton />
    </div>
  );
}
