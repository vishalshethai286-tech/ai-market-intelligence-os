import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canReviewBrainFacts } from "@/lib/access-control";
import { getBusinessBrain, getFeedbackCountsByFact, listBrainFacts } from "@/lib/business-brain/service";
import type { BrainFact, BrainFactType } from "@/models";
import { Badge } from "@/components/ui/badge";
import { FactRow, type FeedbackKind } from "@/components/business-brain/fact-row";
import { RefreshBrainButton } from "@/components/business-brain/refresh-brain-button";

export const metadata: Metadata = {
  title: "Business Brain",
};

const SECTIONS: { label: string; types: BrainFactType[] }[] = [
  {
    label: "Company summary",
    types: [
      "COMPANY_NAME",
      "BUSINESS_DESCRIPTION",
      "INDUSTRY",
      "BUSINESS_MODEL",
      "HEADQUARTERS",
      "OPERATION_TYPE",
      "CERTIFICATION",
      "COUNTRY_SERVED",
      "CONTACT_INFO",
      "FINANCIAL",
      "LEADERSHIP",
      "OTHER",
    ],
  },
  { label: "Products & services", types: ["PRODUCT_OR_SERVICE"] },
  { label: "Applications", types: ["APPLICATION"] },
  { label: "Target industries", types: ["TARGET_INDUSTRY"] },
  { label: "Buyer personas", types: ["BUYER_TYPE"] },
  { label: "Search keywords", types: ["KEYWORD"] },
  { label: "Project keywords", types: ["PROJECT_KEYWORD"] },
  { label: "Tender keywords", types: ["TENDER_KEYWORD"] },
  { label: "Vendor registration keywords", types: ["VENDOR_REGISTRATION_KEYWORD"] },
  { label: "Buying signals", types: ["BUYING_SIGNAL"] },
  { label: "Competitors", types: ["COMPETITOR"] },
];

/** Fact types with a learnable feedback signal wired into the page today. */
const FEEDBACK_KIND_BY_FACT_TYPE: Partial<Record<BrainFactType, FeedbackKind>> = {
  PRODUCT_OR_SERVICE: "product",
  TARGET_INDUSTRY: "industry",
};

const BRAIN_STATUS_BADGE = {
  ACTIVE: { variant: "success" as const, label: "Active" },
  STALE: { variant: "warning" as const, label: "Stale" },
  INITIALIZING: { variant: "outline" as const, label: "Building" },
};

export default async function BusinessBrainPage() {
  const active = await requireActiveWorkspace();
  const canReview = canReviewBrainFacts(active.role);

  const [brain, facts] = await Promise.all([
    getBusinessBrain(active.workspace.id),
    listBrainFacts(active.workspace.id),
  ]);

  const factsByType = new Map<string, BrainFact[]>();
  for (const fact of facts) {
    const list = factsByType.get(fact.factType) ?? [];
    list.push(fact);
    factsByType.set(fact.factType, list);
  }

  const feedbackFactIds = facts.filter((fact) => FEEDBACK_KIND_BY_FACT_TYPE[fact.factType]).map((fact) => fact.id);
  const feedbackCounts = await getFeedbackCountsByFact(active.workspace.id, feedbackFactIds);

  const brainBadge = brain ? BRAIN_STATUS_BADGE[brain.status] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business Brain</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Everything the AI has learned about your company. Mark facts correct, incorrect, or needing review.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {brainBadge && <Badge variant={brainBadge.variant}>{brainBadge.label}</Badge>}
            {canReview && brain && <RefreshBrainButton />}
          </div>
          {brain?.lastUpdatedAt && (
            <p className="text-xs text-black/50 dark:text-white/50">Last updated {brain.lastUpdatedAt.toLocaleString()}</p>
          )}
        </div>
      </div>

      {(!brain || facts.length === 0) && (
        <div className="mt-8 rounded-xl border border-black/[.08] p-6 text-sm dark:border-white/[.145]">
          <p className="text-black/70 dark:text-white/70">
            Your Business Brain hasn&apos;t been built yet. It&apos;s created automatically from your company
            profile and product catalog once onboarding finishes.
          </p>
        </div>
      )}

      {brain && facts.length > 0 && (
        <div className="mt-8 flex flex-col gap-8">
          {SECTIONS.map((section) => {
            const sectionFacts = section.types.flatMap((type) => factsByType.get(type) ?? []);
            if (sectionFacts.length === 0) return null;

            return (
              <section key={section.label}>
                <h2 className="text-sm font-medium">{section.label}</h2>
                <div className="mt-3 flex flex-col gap-2">
                  {sectionFacts.map((fact) => (
                    <FactRow
                      key={fact.id}
                      fact={fact}
                      canReview={canReview}
                      feedbackKind={FEEDBACK_KIND_BY_FACT_TYPE[fact.factType]}
                      feedbackCounts={feedbackCounts.get(fact.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
