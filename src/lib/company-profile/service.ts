import "server-only";
import { prisma } from "@/lib/prisma";
import { extractCompanyProfile } from "./extract";
import type { ExtractedCompanyProfile, OperationType } from "./schema";
import type { Prisma } from "@/generated/prisma/client";

export class NoAnalysisError extends Error {}

export function getCompanyProfile(workspaceId: string) {
  return prisma.companyProfile.findUnique({ where: { workspaceId } });
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
 */
export async function generateCompanyProfile(workspaceId: string) {
  const analysis = await prisma.websiteAnalysis.findFirst({
    where: { workspaceId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  if (!analysis) {
    throw new NoAnalysisError("Run a website analysis before generating a company profile.");
  }

  const extracted = await extractCompanyProfile(analysis);
  const fields = toProfileFields(extracted);
  const aiRawExtraction = extracted as unknown as Prisma.InputJsonValue;

  return prisma.companyProfile.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      websiteAnalysisId: analysis.id,
      ...fields,
      sourceUrls: [analysis.url],
      aiRawExtraction,
      status: "PENDING_REVIEW",
    },
    update: {
      websiteAnalysisId: analysis.id,
      ...fields,
      sourceUrls: [analysis.url],
      aiRawExtraction,
      status: "PENDING_REVIEW",
      approvedAt: null,
      approvedByUserId: null,
    },
  });
}

export type CompanyProfileEditableFields = {
  companyName: string;
  businessDescription: string;
  industry: string;
  businessModel: string;
  countriesServed: string[];
  headquarters: string;
  operationType: OperationType;
  certifications: string[];
  keyProductsServices: string[];
};

/** Applies a user's edits to the current fields. Leaves approval status untouched. */
export async function updateCompanyProfile(workspaceId: string, fields: CompanyProfileEditableFields) {
  return prisma.companyProfile.update({
    where: { workspaceId },
    data: {
      companyName: fields.companyName || null,
      businessDescription: fields.businessDescription || null,
      industry: fields.industry || null,
      businessModel: fields.businessModel || null,
      countriesServed: fields.countriesServed,
      headquarters: fields.headquarters || null,
      operationType: fields.operationType,
      certifications: fields.certifications,
      keyProductsServices: fields.keyProductsServices,
    },
  });
}

export async function approveCompanyProfile(workspaceId: string, userId: string) {
  return prisma.companyProfile.update({
    where: { workspaceId },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: userId },
  });
}
