import "server-only";
import { prisma } from "@/lib/prisma";
import { identifyCompetitors } from "./competitors";
import { OPERATION_TYPE_LABELS } from "@/lib/company-profile/constants";
import { TARGET_COUNTRIES } from "@/config/onboarding";
import type { Prisma } from "@/generated/prisma/client";

function countryName(code: string): string {
  return TARGET_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** Case-insensitive de-dupe that preserves the first-seen casing. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * Builds the initial AI Business Brain for a workspace right after
 * onboarding completes. Aggregates the workspace's CompanyProfile (preferring
 * whatever exists, approved or not — this runs after the review steps, but
 * shouldn't produce an empty brain just because the user didn't explicitly
 * approve), its ProductService catalog (excluding only REJECTED rows), and
 * the onboarding target countries into BrainFact / BrainEntity /
 * BrainRelationship rows. Identifies competitors via Claude if any are
 * confidently known.
 *
 * Idempotent: if the workspace already has a populated brain (status other
 * than INITIALIZING), this is a no-op — it builds the *initial* brain once.
 * If a previous attempt started but failed, the brain stays INITIALIZING so
 * a later call retries rather than returning permanently empty.
 */
export async function buildInitialBrain(workspaceId: string) {
  const existingBrain = await prisma.businessBrain.findUnique({ where: { workspaceId } });
  if (existingBrain && existingBrain.status !== "INITIALIZING") {
    return existingBrain;
  }

  const brain = existingBrain ?? (await prisma.businessBrain.create({ data: { workspaceId, status: "INITIALIZING" } }));

  const run = await prisma.brainUpdateRun.create({
    data: { workspaceId, brainId: brain.id, status: "RUNNING", trigger: "ONBOARDING", startedAt: new Date() },
  });

  try {
    const [profile, products, onboarding, analysis, workspace] = await Promise.all([
      prisma.companyProfile.findUnique({ where: { workspaceId } }),
      prisma.productService.findMany({ where: { workspaceId, status: { not: "REJECTED" } } }),
      prisma.workspaceOnboarding.findUnique({ where: { workspaceId } }),
      prisma.websiteAnalysis.findFirst({ where: { workspaceId, status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
      prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    ]);

    const targetCountryNames = (onboarding?.targetCountries ?? []).map(countryName);
    const countryNames = dedupe([...(profile?.countriesServed ?? []), ...targetCountryNames]);
    const targetIndustries = dedupe(products.flatMap((p) => p.targetIndustries));
    const buyerTypes = dedupe(products.flatMap((p) => p.buyerTypes));
    const keywords = dedupe(products.flatMap((p) => p.keywords));

    const competitors = profile
      ? await identifyCompetitors({
          companyName: profile.companyName || workspace.name,
          industry: profile.industry ?? "",
          businessDescription: profile.businessDescription ?? "",
          keyProductsServices: profile.keyProductsServices,
          countriesServed: countryNames,
        })
      : [];

    const factsCreated = await prisma.$transaction(async (tx) => {
      const source = analysis
        ? await tx.brainSource.create({
            data: {
              workspaceId,
              brainId: brain.id,
              websiteAnalysisId: analysis.id,
              sourceType: "WEBSITE_PAGE",
              url: analysis.url,
              title: analysis.title,
              fetchedAt: analysis.fetchedAt,
            },
          })
        : null;

      const selfEntity = await tx.brainEntity.create({
        data: {
          workspaceId,
          brainId: brain.id,
          entityType: "ORGANIZATION",
          name: profile?.companyName || workspace.name,
          description: profile?.businessDescription || null,
          confidenceScore: profile?.confidenceScore ?? 0,
        },
      });

      const factRows: Prisma.BrainFactCreateManyInput[] = [];
      const baseFact = {
        workspaceId,
        brainId: brain.id,
        sourceId: source?.id ?? null,
        sourceUrl: source?.url ?? null,
        lastVerifiedAt: new Date(),
        freshnessScore: 1,
      };

      if (profile) {
        if (profile.companyName) {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "COMPANY_NAME",
            factValue: profile.companyName,
            confidenceScore: profile.confidenceScore,
          });
        }
        if (profile.businessDescription) {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "BUSINESS_DESCRIPTION",
            factValue: profile.businessDescription,
            confidenceScore: profile.confidenceScore,
          });
        }
        if (profile.industry) {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "INDUSTRY",
            factValue: profile.industry,
            confidenceScore: profile.confidenceScore,
          });
        }
        if (profile.businessModel) {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "BUSINESS_MODEL",
            factValue: profile.businessModel,
            confidenceScore: profile.confidenceScore,
          });
        }
        if (profile.headquarters) {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "HEADQUARTERS",
            factValue: profile.headquarters,
            confidenceScore: profile.confidenceScore,
          });
        }
        if (profile.operationType !== "UNKNOWN") {
          factRows.push({
            ...baseFact,
            entityId: selfEntity.id,
            factType: "OPERATION_TYPE",
            factValue: OPERATION_TYPE_LABELS[profile.operationType],
            confidenceScore: profile.confidenceScore,
          });
        }
        for (const certification of dedupe(profile.certifications)) {
          const certEntity = await tx.brainEntity.create({
            data: {
              workspaceId,
              brainId: brain.id,
              entityType: "CERTIFICATION",
              name: certification,
              confidenceScore: profile.confidenceScore,
            },
          });
          await tx.brainRelationship.create({
            data: {
              workspaceId,
              brainId: brain.id,
              sourceId: source?.id ?? null,
              fromEntityId: selfEntity.id,
              toEntityId: certEntity.id,
              relationshipType: "CERTIFIED_BY",
              confidenceScore: profile.confidenceScore,
            },
          });
          factRows.push({
            ...baseFact,
            entityId: certEntity.id,
            factType: "CERTIFICATION",
            factValue: certification,
            confidenceScore: profile.confidenceScore,
          });
        }
      }

      for (const country of countryNames) {
        factRows.push({ ...baseFact, factType: "COUNTRY_SERVED", factValue: country, confidenceScore: profile?.confidenceScore ?? 0 });
      }
      for (const industry of targetIndustries) {
        factRows.push({ ...baseFact, factType: "TARGET_INDUSTRY", factValue: industry, confidenceScore: 0 });
      }
      for (const buyerType of buyerTypes) {
        factRows.push({ ...baseFact, factType: "BUYER_TYPE", factValue: buyerType, confidenceScore: 0 });
      }
      for (const keyword of keywords) {
        factRows.push({ ...baseFact, factType: "KEYWORD", factValue: keyword, confidenceScore: 0 });
      }

      for (const product of products) {
        const productEntity = await tx.brainEntity.create({
          data: {
            workspaceId,
            brainId: brain.id,
            entityType: "PRODUCT",
            name: product.name,
            description: product.description,
            confidenceScore: product.confidenceScore,
          },
        });
        await tx.brainRelationship.create({
          data: {
            workspaceId,
            brainId: brain.id,
            sourceId: source?.id ?? null,
            fromEntityId: selfEntity.id,
            toEntityId: productEntity.id,
            relationshipType: "OFFERS",
            confidenceScore: product.confidenceScore,
          },
        });
        factRows.push({
          ...baseFact,
          entityId: productEntity.id,
          factType: "PRODUCT_OR_SERVICE",
          factValue: product.name,
          confidenceScore: product.confidenceScore,
        });
      }

      for (const competitor of competitors) {
        const competitorEntity = await tx.brainEntity.create({
          data: {
            workspaceId,
            brainId: brain.id,
            entityType: "ORGANIZATION",
            name: competitor.name,
            description: competitor.reason,
            confidenceScore: competitor.confidenceScore,
          },
        });
        await tx.brainRelationship.create({
          data: {
            workspaceId,
            brainId: brain.id,
            fromEntityId: selfEntity.id,
            toEntityId: competitorEntity.id,
            relationshipType: "COMPETES_WITH",
            confidenceScore: competitor.confidenceScore,
          },
        });
      }

      if (factRows.length > 0) {
        await tx.brainFact.createMany({ data: factRows });
      }

      return factRows.length;
    });

    await Promise.all([
      prisma.businessBrain.update({
        where: { id: brain.id },
        data: { status: "ACTIVE", lastUpdatedAt: new Date() },
      }),
      prisma.brainUpdateRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", factsCreated, completedAt: new Date() },
      }),
    ]);

    return prisma.businessBrain.findUniqueOrThrow({ where: { id: brain.id } });
  } catch (error) {
    await prisma.brainUpdateRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error building the initial brain.",
        completedAt: new Date(),
      },
    });
    return brain;
  }
}
