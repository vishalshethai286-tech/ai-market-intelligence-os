import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditCompanyProfile } from "@/lib/access-control";
import { getCompanyProfile } from "@/lib/company-profile/service";
import { getLatestAnalysis } from "@/lib/website-analysis";
import { Badge } from "@/components/ui/badge";
import { CompanyProfileForm } from "@/components/company-profile/company-profile-form";
import { RegenerateButton } from "@/components/company-profile/regenerate-button";

export const metadata: Metadata = {
  title: "Company profile",
};

export default async function CompanyProfilePage() {
  const active = await requireActiveWorkspace();
  const canEdit = canEditCompanyProfile(active.role);

  const [profile, latestAnalysis] = await Promise.all([
    getCompanyProfile(active.workspace.id),
    getLatestAnalysis(active.workspace.id),
  ]);

  const hasCompletedAnalysis = latestAnalysis?.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company profile</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            AI-generated from your website analysis. Review and edit before approving.
          </p>
        </div>
        {profile && (
          <Badge variant={profile.status === "APPROVED" ? "success" : "warning"}>
            {profile.status === "APPROVED" ? "Approved" : "Needs review"}
          </Badge>
        )}
      </div>

      {!profile && (
        <div className="mt-8 rounded-xl border border-black/[.08] p-6 text-sm dark:border-white/[.145]">
          {hasCompletedAnalysis ? (
            <>
              <p className="text-black/70 dark:text-white/70">
                No company profile yet. Generate one from your latest website analysis.
              </p>
              {canEdit ? (
                <RegenerateButton label="Generate profile" className="mt-3" />
              ) : (
                <p className="mt-3 text-black/50 dark:text-white/50">
                  Ask an owner, admin, or sales user to generate one.
                </p>
              )}
            </>
          ) : (
            <p className="text-black/70 dark:text-white/70">
              Run a website analysis first — a company profile is built from that content. You can
              start one from onboarding, or by re-entering your company website.
            </p>
          )}
        </div>
      )}

      {profile && (
        <div className="mt-8">
          <CompanyProfileForm profile={profile} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}
