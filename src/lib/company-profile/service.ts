import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { CompanyProfile, WebsiteAnalysis, WorkspaceOnboarding } from "@/models";
import { extractCompanyProfileAI } from "@/lib/ai-extraction";
import type { ExtractedCompanyProfile, OperationType } from "./schema";

export class NoAnalysisError extends Error {}

export async function getCompanyProfile(workspaceId: string): Promise<CompanyProfile | null> {
  await dbConnect();
  const profile = await CompanyProfile.findOne({ workspaceId });
  return profile ? (profile.toObject() as CompanyProfile) : null;
}

function toProfileFields(extracted: ExtractedCompanyProfile) {
  return {
    companyName: extracted.companyName || null,
    businessDescription: extracted.businessDescription || null,
    industry: extracted.industry || null,
    businessModel: extracted.businessModel || null,
    countriesServed: extracted.countriesServed,
    headquarters: extracted.headquarters || null,
    operationType: extracted.operationType,
    certifications: extracted.certifications,
    keyProductsServices: extracted.keyProductsServices,
    confidenceScore: extracted.confidenceScore,
  };
}

/**
 * Runs AI extraction against the workspace's latest completed WebsiteAnalysis
 * and upserts the result as a fresh PENDING_REVIEW draft — a regenerate
 * always requires re-review, even if the previous draft was approved. The
 * model's original output for this run is kept in `aiRawExtraction` as an
 * audit trail, independent of whatever the user edits afterward.
 *
 * website/workEmail/targetCountries/preferredCustomerTypes are denormalized
 * from the workspace's WorkspaceOnboarding row (set during onboarding, not
 * inferred by the AI) so the durable CompanyProfile carries the full
 * "initial business understanding" on its own, without downstream features
 * needing to join through the wizard-progress-only onboarding row.
 */
export async function generateCompanyProfile(workspaceId: string) {
  await dbConnect();
  const [analysis, onboarding] = await Promise.all([
    WebsiteAnalysis.findOne({ workspaceId, status: "COMPLETED" }).sort({ createdAt: -1 }),
    WorkspaceOnboarding.findOne({ workspaceId }),
  ]);
  if (!analysis) {
    throw new NoAnalysisError("Run a website analysis before generating a company profile.");
  }

  const extracted = await extractCompanyProfileAI(analysis);
  const fields = toProfileFields(extracted);
  const aiRawExtraction = extracted as unknown;
  const onboardingFields = {
    website: onboarding?.companyWebsite ?? analysis.url,
    workEmail: onboarding?.workEmail ?? null,
    targetCountries: onboarding?.targetCountries ?? [],
    preferredCustomerTypes: onboarding?.customerTypes ?? [],
  };

  return CompanyProfile.findOneAndUpdate(
    { workspaceId },
    {
      $set: {
        workspaceId,
        websiteAnalysisId: analysis.id,
        ...fields,
        ...onboardingFields,
        sourceUrls: [analysis.url],
        aiRawExtraction,
        status: "PENDING_REVIEW",
        approvedAt: null,
        approvedByUserId: null,
      },
    },
    { upsert: true, new: true },
  );
}

export type CompanyProfileEditableFields = {
  companyName: string;
  website: string;
  workEmail: string;
  businessDescription: string;
  industry: string;
  businessModel: string;
  countriesServed: string[];
  targetCountries: string[];
  preferredCustomerTypes: string[];
  headquarters: string;
  operationType: OperationType;
  certifications: string[];
  keyProductsServices: string[];
};

/** Applies a user's edits to the current fields. Leaves approval status untouched. */
export async function updateCompanyProfile(workspaceId: string, fields: CompanyProfileEditableFields) {
  await dbConnect();
  return CompanyProfile.findOneAndUpdate(
    { workspaceId },
    {
      companyName: fields.companyName || null,
      website: fields.website || null,
      workEmail: fields.workEmail || null,
      businessDescription: fields.businessDescription || null,
      industry: fields.industry || null,
      businessModel: fields.businessModel || null,
      countriesServed: fields.countriesServed,
      targetCountries: fields.targetCountries,
      preferredCustomerTypes: fields.preferredCustomerTypes,
      headquarters: fields.headquarters || null,
      operationType: fields.operationType,
      certifications: fields.certifications,
      keyProductsServices: fields.keyProductsServices,
    },
    { new: true },
  );
}

export async function approveCompanyProfile(workspaceId: string, userId: string) {
  await dbConnect();
  return CompanyProfile.findOneAndUpdate(
    { workspaceId },
    { status: "APPROVED", approvedAt: new Date(), approvedByUserId: userId },
    { new: true },
  );
}
