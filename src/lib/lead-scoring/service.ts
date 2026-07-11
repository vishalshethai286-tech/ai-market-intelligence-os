import "server-only";
import { prisma } from "@/lib/prisma";
import { getBusinessBrain, listBrainFacts, BrainNotReadyError } from "@/lib/business-brain/service";
import { computeLeadScore } from "./scoring";
import type { LeadScoringContext } from "./scoring";
import type { BrainFact, BrainFactType } from "@/generated/prisma/client";

export { BrainNotReadyError };
export class TargetCompanyNotFoundError extends Error {}

function factValues(facts: BrainFact[], type: BrainFactType): string[] {
  return facts.filter((f) => f.factType === type).map((f) => f.factValue);
}

/**
 * Assembles everything the pure scorer needs once per run: current Business
 * Brain facts (what we sell, who to, where), every other TargetCompany in
 * this workspace already marked APPROVED (the "known good leads" reference
 * pool), and Business Brain GOOD_LEAD/BAD_LEAD feedback tallied by the
 * company name it was given against (BrainFeedback.subjectLabel — the field
 * added specifically for lead feedback before this model existed).
 */
async function buildScoringContext(workspaceId: string): Promise<LeadScoringContext> {
  const [facts, goodLeadReferences, feedbackRows] = await Promise.all([
    listBrainFacts(workspaceId),
    prisma.targetCompany.findMany({
      where: { workspaceId, status: "APPROVED" },
      select: { id: true, industry: true, buyerType: true, matchedProduct: true, country: true },
    }),
    prisma.brainFeedback.findMany({
      where: { workspaceId, feedbackType: { in: ["GOOD_LEAD", "BAD_LEAD"] } },
      select: { feedbackType: true, subjectLabel: true },
    }),
  ]);

  const feedbackByCompanyKey = new Map<string, { good: number; bad: number }>();
  for (const row of feedbackRows) {
    if (!row.subjectLabel) continue;
    const key = row.subjectLabel.trim().toLowerCase();
    const counts = feedbackByCompanyKey.get(key) ?? { good: 0, bad: 0 };
    if (row.feedbackType === "GOOD_LEAD") counts.good += 1;
    else counts.bad += 1;
    feedbackByCompanyKey.set(key, counts);
  }

  return {
    products: factValues(facts, "PRODUCT_OR_SERVICE"),
    targetIndustries: factValues(facts, "TARGET_INDUSTRY"),
    buyerTypes: factValues(facts, "BUYER_TYPE"),
    countriesServed: factValues(facts, "COUNTRY_SERVED"),
    goodLeadReferences,
    feedbackByCompanyKey,
  };
}

/** Scores a single target company and persists `priorityScore`/`priorityGrade`. */
export async function scoreTargetCompany(workspaceId: string, targetCompanyId: string) {
  const target = await prisma.targetCompany.findFirst({ where: { id: targetCompanyId, workspaceId } });
  if (!target) {
    throw new TargetCompanyNotFoundError("That target company doesn't exist in this workspace.");
  }

  const context = await buildScoringContext(workspaceId);
  const breakdown = computeLeadScore(target, context);

  const updated = await prisma.targetCompany.update({
    where: { id: target.id },
    data: { priorityScore: breakdown.totalScore, priorityGrade: breakdown.grade },
  });

  return { target: updated, breakdown };
}

/**
 * Scores every target company in a workspace, reusing one scoring context
 * (Brain facts, approved-lead references, feedback tallies) across the whole
 * batch rather than reloading it per row.
 */
export async function scoreAllTargetCompanies(workspaceId: string) {
  const brain = await getBusinessBrain(workspaceId);
  if (!brain) {
    throw new BrainNotReadyError("Build the initial Business Brain before scoring target companies.");
  }

  const [context, targets] = await Promise.all([
    buildScoringContext(workspaceId),
    prisma.targetCompany.findMany({ where: { workspaceId } }),
  ]);

  let scored = 0;
  for (const target of targets) {
    const breakdown = computeLeadScore(target, context);
    await prisma.targetCompany.update({
      where: { id: target.id },
      data: { priorityScore: breakdown.totalScore, priorityGrade: breakdown.grade },
    });
    scored += 1;
  }

  return { scored, total: targets.length };
}
