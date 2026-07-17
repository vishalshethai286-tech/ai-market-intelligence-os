import "server-only";
import { dbConnect } from "@/lib/mongodb";
import {
  BusinessBrain as BusinessBrainModel,
  BrainSource as BrainSourceModel,
  BrainEntity as BrainEntityModel,
  BrainRelationship as BrainRelationshipModel,
  BrainFact as BrainFactModel,
  BrainUpdateRun as BrainUpdateRunModel,
  BrainFeedback as BrainFeedbackModel,
  CompanyProfile,
  ProductService,
  WorkspaceOnboarding,
  WebsiteAnalysis,
  Workspace,
} from "@/models";
import { identifyCompetitors } from "./competitors";
import { OPERATION_TYPE_LABELS } from "@/lib/company-profile/constants";
import { TARGET_COUNTRIES } from "@/config/onboarding";
import { canStartNewAnalysis, runAndStoreWebsiteAnalysis } from "@/lib/website-analysis";
import { generateProductServices } from "@/lib/product-discovery/service";
import type {
  BusinessBrain,
  BrainEntityType,
  BrainFact,
  BrainFactType,
  BrainFactVerificationStatus,
  BrainFeedbackType,
  BrainUpdateTrigger,
} from "@/models";

export class BrainFactNotFoundError extends Error {}
export class BrainFeedbackTargetError extends Error {}
export class BrainNotReadyError extends Error {}
export class BrainRefreshCooldownError extends Error {}

const POSITIVE_FEEDBACK_TYPES: readonly BrainFeedbackType[] = ["GOOD_LEAD", "CORRECT_PRODUCT", "GOOD_INDUSTRY"];

export async function getBusinessBrain(workspaceId: string): Promise<BusinessBrain | null> {
  await dbConnect();
  const brain = await BusinessBrainModel.findOne({ workspaceId });
  return brain ? (brain.toObject() as BusinessBrain) : null;
}

/** All facts for a workspace's brain, grouped for display by the page (which buckets by factType). */
export async function listBrainFacts(workspaceId: string): Promise<BrainFact[]> {
  await dbConnect();
  const facts = await BrainFactModel.find({ workspaceId }).sort({ factType: 1, createdAt: 1 });
  return facts.map((f) => f.toObject() as BrainFact);
}

/**
 * Records a human's correct/incorrect/needs-review judgment on a fact.
 * Marking CORRECT is itself an act of verification, so it also bumps
 * `lastVerifiedAt`/`freshnessScore` — a human confirming a fact is accurate
 * is strictly stronger evidence than the automatic decay clock.
 */
export async function markFactVerification(
  workspaceId: string,
  factId: string,
  userId: string,
  status: BrainFactVerificationStatus,
) {
  await dbConnect();
  const existing = await BrainFactModel.findOne({ _id: factId, workspaceId });
  if (!existing) {
    throw new BrainFactNotFoundError("That fact doesn't exist in this workspace.");
  }

  const updated = await BrainFactModel.findByIdAndUpdate(
    factId,
    {
      verificationStatus: status,
      verifiedByUserId: userId,
      ...(status === "CORRECT" ? { lastVerifiedAt: new Date(), freshnessScore: 1 } : {}),
    },
    { new: true },
  );
  return updated!.toObject() as BrainFact;
}

/**
 * Records a human's feedback signal — good/bad lead, correct/incorrect
 * product, good/bad industry — for later use in scoring and discovery.
 * Append-only: unlike `markFactVerification` (a single mutable "is this fact
 * still true" judgment), a fact or entity can accumulate many feedback events
 * over time, each contributing to a tally. `factId`/`entityId` are optional
 * and mutually independent so feedback can attach to a fact, an entity, or
 * neither (a freeform `subjectLabel`, e.g. a lead's company name before lead
 * discovery exists).
 */
export async function recordFeedback(
  workspaceId: string,
  userId: string,
  input: {
    feedbackType: BrainFeedbackType;
    factId?: string;
    entityId?: string;
    subjectLabel?: string;
    note?: string;
  },
) {
  await dbConnect();
  const brain = await BusinessBrainModel.findOne({ workspaceId });
  if (!brain) {
    throw new BrainFeedbackTargetError("This workspace doesn't have a Business Brain yet.");
  }

  if (input.factId) {
    const fact = await BrainFactModel.findOne({ _id: input.factId, workspaceId });
    if (!fact) {
      throw new BrainFeedbackTargetError("That fact doesn't exist in this workspace.");
    }
  }
  if (input.entityId) {
    const entity = await BrainEntityModel.findOne({ _id: input.entityId, workspaceId });
    if (!entity) {
      throw new BrainFeedbackTargetError("That entity doesn't exist in this workspace.");
    }
  }

  const feedback = await BrainFeedbackModel.create({
    workspaceId,
    brainId: brain.id,
    userId,
    feedbackType: input.feedbackType,
    factId: input.factId ?? null,
    entityId: input.entityId ?? null,
    subjectLabel: input.subjectLabel ?? null,
    note: input.note ?? null,
  });
  return feedback.toObject();
}

/** Tally of positive vs. negative feedback per fact, keyed by factId, for display alongside each fact. */
export async function getFeedbackCountsByFact(
  workspaceId: string,
  factIds: string[],
): Promise<Map<string, { positive: number; negative: number }>> {
  const counts = new Map<string, { positive: number; negative: number }>();
  if (factIds.length === 0) return counts;

  await dbConnect();
  const rows = await BrainFeedbackModel.aggregate([
    { $match: { workspaceId, factId: { $in: factIds } } },
    { $group: { _id: { factId: "$factId", feedbackType: "$feedbackType" }, count: { $sum: 1 } } },
  ]);

  for (const row of rows) {
    const factId = row._id.factId;
    if (!factId) continue;
    const entry = counts.get(factId) ?? { positive: 0, negative: 0 };
    if (POSITIVE_FEEDBACK_TYPES.includes(row._id.feedbackType)) entry.positive += row.count;
    else entry.negative += row.count;
    counts.set(factId, entry);
  }

  return counts;
}

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

/** Shape of a single BrainFact row for a batch insert — mirrors what Prisma's `BrainFactCreateManyInput` covered here. */
type FactCreateInput = {
  workspaceId: string;
  brainId: string;
  sourceId: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date;
  freshnessScore: number;
  entityId?: string;
  factType: BrainFactType;
  factValue: string;
  confidenceScore: number;
};

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
  await dbConnect();
  const existingBrain = await BusinessBrainModel.findOne({ workspaceId });
  if (existingBrain && existingBrain.status !== "INITIALIZING") {
    return existingBrain.toObject() as BusinessBrain;
  }

  const brain = existingBrain ?? (await BusinessBrainModel.create({ workspaceId, status: "INITIALIZING" }));

  const run = await BrainUpdateRunModel.create({
    workspaceId,
    brainId: brain.id,
    status: "RUNNING",
    trigger: "ONBOARDING",
    startedAt: new Date(),
  });

  try {
    const [profile, products, onboarding, analysis, workspace] = await Promise.all([
      CompanyProfile.findOne({ workspaceId }),
      ProductService.find({ workspaceId, status: { $ne: "REJECTED" } }),
      WorkspaceOnboarding.findOne({ workspaceId }),
      WebsiteAnalysis.findOne({ workspaceId, status: "COMPLETED" }).sort({ createdAt: -1 }),
      Workspace.findById(workspaceId),
    ]);
    if (!workspace) {
      throw new Error("This workspace no longer exists.");
    }

    const targetCountryNames = (onboarding?.targetCountries ?? []).map(countryName);
    const countryNames = dedupe([...(profile?.countriesServed ?? []), ...targetCountryNames]);
    const targetIndustries = dedupe(products.flatMap((p) => p.targetIndustries));
    const buyerTypes = dedupe(products.flatMap((p) => p.buyerTypes));
    const keywords = dedupe(products.flatMap((p) => p.keywords));
    const applications = dedupe(products.flatMap((p) => p.applications));
    const projectKeywords = dedupe(products.flatMap((p) => p.projectKeywords));
    const tenderKeywords = dedupe(products.flatMap((p) => p.tenderKeywords));
    const vendorRegistrationKeywords = dedupe(products.flatMap((p) => p.vendorRegistrationKeywords));

    const competitors = profile
      ? await identifyCompetitors({
          companyName: profile.companyName || workspace.name,
          industry: profile.industry ?? "",
          businessDescription: profile.businessDescription ?? "",
          keyProductsServices: profile.keyProductsServices,
          countriesServed: countryNames,
        })
      : [];

    // Not wrapped in a DB transaction — standalone MongoDB (no replica set)
    // doesn't support multi-document transactions; acceptable for an MVP.
    const source = analysis
      ? await BrainSourceModel.create({
          workspaceId,
          brainId: brain.id,
          websiteAnalysisId: analysis.id,
          sourceType: "WEBSITE_PAGE",
          url: analysis.url,
          title: analysis.title,
          fetchedAt: analysis.fetchedAt,
        })
      : null;

    const selfEntity = await BrainEntityModel.create({
      workspaceId,
      brainId: brain.id,
      entityType: "ORGANIZATION",
      name: profile?.companyName || workspace.name,
      description: profile?.businessDescription || null,
      confidenceScore: profile?.confidenceScore ?? 0,
    });

    const factRows: FactCreateInput[] = [];
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
          factValue: OPERATION_TYPE_LABELS[profile.operationType as keyof typeof OPERATION_TYPE_LABELS],
          confidenceScore: profile.confidenceScore,
        });
      }
      for (const certification of dedupe(profile.certifications)) {
        const certEntity = await BrainEntityModel.create({
          workspaceId,
          brainId: brain.id,
          entityType: "CERTIFICATION",
          name: certification,
          confidenceScore: profile.confidenceScore,
        });
        await BrainRelationshipModel.create({
          workspaceId,
          brainId: brain.id,
          sourceId: source?.id ?? null,
          fromEntityId: selfEntity.id,
          toEntityId: certEntity.id,
          relationshipType: "CERTIFIED_BY",
          confidenceScore: profile.confidenceScore,
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
    for (const application of applications) {
      factRows.push({ ...baseFact, factType: "APPLICATION", factValue: application, confidenceScore: 0 });
    }
    for (const projectKeyword of projectKeywords) {
      factRows.push({ ...baseFact, factType: "PROJECT_KEYWORD", factValue: projectKeyword, confidenceScore: 0 });
    }
    for (const tenderKeyword of tenderKeywords) {
      factRows.push({ ...baseFact, factType: "TENDER_KEYWORD", factValue: tenderKeyword, confidenceScore: 0 });
    }
    for (const vendorKeyword of vendorRegistrationKeywords) {
      factRows.push({ ...baseFact, factType: "VENDOR_REGISTRATION_KEYWORD", factValue: vendorKeyword, confidenceScore: 0 });
    }

    for (const product of products) {
      const productEntity = await BrainEntityModel.create({
        workspaceId,
        brainId: brain.id,
        entityType: "PRODUCT",
        name: product.name,
        description: product.description,
        confidenceScore: product.confidenceScore,
      });
      await BrainRelationshipModel.create({
        workspaceId,
        brainId: brain.id,
        sourceId: source?.id ?? null,
        fromEntityId: selfEntity.id,
        toEntityId: productEntity.id,
        relationshipType: "OFFERS",
        confidenceScore: product.confidenceScore,
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
      const competitorEntity = await BrainEntityModel.create({
        workspaceId,
        brainId: brain.id,
        entityType: "ORGANIZATION",
        name: competitor.name,
        description: competitor.reason,
        confidenceScore: competitor.confidenceScore,
      });
      await BrainRelationshipModel.create({
        workspaceId,
        brainId: brain.id,
        fromEntityId: selfEntity.id,
        toEntityId: competitorEntity.id,
        relationshipType: "COMPETES_WITH",
        confidenceScore: competitor.confidenceScore,
      });
      factRows.push({
        ...baseFact,
        sourceId: null,
        sourceUrl: null,
        entityId: competitorEntity.id,
        factType: "COMPETITOR",
        factValue: competitor.name,
        confidenceScore: competitor.confidenceScore,
      });
    }

    if (factRows.length > 0) {
      await BrainFactModel.insertMany(factRows);
    }
    const factsCreated = factRows.length;

    await Promise.all([
      BusinessBrainModel.updateOne({ _id: brain.id }, { status: "ACTIVE", lastUpdatedAt: new Date() }),
      BrainUpdateRunModel.updateOne({ _id: run.id }, { status: "COMPLETED", factsCreated, completedAt: new Date() }),
    ]);

    const finalBrain = await BusinessBrainModel.findById(brain.id);
    if (!finalBrain) {
      throw new Error("This workspace's Business Brain disappeared while it was being built.");
    }
    return finalBrain.toObject() as BusinessBrain;
  } catch (error) {
    await BrainUpdateRunModel.updateOne(
      { _id: run.id },
      {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error building the initial brain.",
        completedAt: new Date(),
      },
    );
    return brain.toObject() as BusinessBrain;
  }
}

type FactCounters = { created: number; updated: number; expired: number; flagged: number };

/**
 * Reconciles a single-value fact tied to the self entity (company name,
 * description, industry, etc.) against a freshly extracted value:
 *  - no existing fact → create one
 *  - existing value unchanged → just re-confirm (bump freshness/source),
 *    clearing any stale pending suggestion
 *  - existing value changed, human hasn't verified it CORRECT → safe to
 *    update in place, resetting verification (a changed value needs
 *    re-review, whatever the previous judgment was)
 *  - existing value changed, human HAS verified it CORRECT → preserve the
 *    approved value untouched, flag NEEDS_REVIEW, and stash the proposed
 *    value in `pendingFactValue` so the conflict is visible, not just flagged
 */
async function reconcileScalarFact(params: {
  workspaceId: string;
  brainId: string;
  entityId: string;
  factType: BrainFactType;
  newValue: string | null;
  confidenceScore: number;
  sourceId: string | null;
  sourceUrl: string | null;
  counters: FactCounters;
}) {
  const { workspaceId, brainId, entityId, factType, newValue, confidenceScore, sourceId, sourceUrl, counters } = params;
  if (!newValue) return;

  const existing = await BrainFactModel.findOne({ workspaceId, brainId, factType, entityId });
  if (!existing) {
    await BrainFactModel.create({
      workspaceId,
      brainId,
      entityId,
      sourceId,
      sourceUrl,
      factType,
      factValue: newValue,
      confidenceScore,
      lastVerifiedAt: new Date(),
      freshnessScore: 1,
    });
    counters.created += 1;
    return;
  }

  const unchanged = existing.factValue.trim().toLowerCase() === newValue.trim().toLowerCase();
  if (unchanged) {
    await BrainFactModel.updateOne(
      { _id: existing.id },
      { sourceId, sourceUrl, lastVerifiedAt: new Date(), freshnessScore: 1, pendingFactValue: null },
    );
    return;
  }

  if (existing.verificationStatus === "CORRECT") {
    await BrainFactModel.updateOne({ _id: existing.id }, { verificationStatus: "NEEDS_REVIEW", pendingFactValue: newValue });
    counters.flagged += 1;
    return;
  }

  await BrainFactModel.updateOne(
    { _id: existing.id },
    {
      factValue: newValue,
      confidenceScore,
      sourceId,
      sourceUrl,
      lastVerifiedAt: new Date(),
      freshnessScore: 1,
      verificationStatus: "UNVERIFIED",
      verifiedByUserId: null,
      pendingFactValue: null,
    },
  );
  counters.updated += 1;
}

/**
 * Reconciles a plain list-of-values fact (countries served, target
 * industries, buyer types, keywords — no entity attached) against a fresh
 * list: new values become new facts, values no longer present are "expired"
 * (freshnessScore reset to 0, never deleted) unless a human verified them
 * CORRECT, in which case they're preserved regardless of whether they still
 * show up in the latest extraction.
 */
async function reconcileListFacts(params: {
  workspaceId: string;
  brainId: string;
  factType: BrainFactType;
  newValues: string[];
  confidenceScore: number;
  sourceId: string | null;
  sourceUrl: string | null;
  counters: FactCounters;
}) {
  const { workspaceId, brainId, factType, newValues, confidenceScore, sourceId, sourceUrl, counters } = params;

  const existingFacts = await BrainFactModel.find({ workspaceId, brainId, factType, entityId: null });
  const existingKeys = new Set(existingFacts.map((f) => f.factValue.trim().toLowerCase()));
  const newKeys = new Set(newValues.map((v) => v.trim().toLowerCase()));

  const toCreate = newValues.filter((v) => !existingKeys.has(v.trim().toLowerCase()));
  if (toCreate.length > 0) {
    await BrainFactModel.insertMany(
      toCreate.map((value) => ({
        workspaceId,
        brainId,
        factType,
        factValue: value,
        confidenceScore,
        sourceId,
        sourceUrl,
        lastVerifiedAt: new Date(),
        freshnessScore: 1,
      })),
    );
    counters.created += toCreate.length;
  }

  for (const fact of existingFacts) {
    if (newKeys.has(fact.factValue.trim().toLowerCase())) continue;
    if (fact.verificationStatus === "CORRECT") continue;
    if (fact.freshnessScore === 0) continue;
    await BrainFactModel.updateOne({ _id: fact.id }, { freshnessScore: 0 });
    counters.expired += 1;
  }
}

/**
 * Reconciles a list of named items that each need their own BrainEntity plus
 * a relationship from the self entity (certifications, products, competitors)
 * — matched by name (case-insensitive). Same create/expire/preserve semantics
 * as `reconcileListFacts`, but a genuinely new item also gets an entity and
 * relationship, not just a fact.
 */
async function reconcileEntityLinkedFacts(params: {
  workspaceId: string;
  brainId: string;
  factType: BrainFactType;
  entityType: BrainEntityType;
  relationshipType: string;
  fromEntityId: string;
  items: { name: string; description?: string | null; confidenceScore: number }[];
  sourceId: string | null;
  sourceUrl: string | null;
  counters: FactCounters;
}) {
  const { workspaceId, brainId, factType, entityType, relationshipType, fromEntityId, items, sourceId, sourceUrl, counters } = params;

  const existingFacts = await BrainFactModel.find({ workspaceId, brainId, factType });
  const existingKeys = new Set(existingFacts.map((f) => f.factValue.trim().toLowerCase()));
  const newKeys = new Set(items.map((item) => item.name.trim().toLowerCase()));

  for (const item of items) {
    if (existingKeys.has(item.name.trim().toLowerCase())) continue;

    const entity = await BrainEntityModel.create({
      workspaceId,
      brainId,
      entityType,
      name: item.name,
      description: item.description ?? null,
      confidenceScore: item.confidenceScore,
    });
    await BrainRelationshipModel.create({
      workspaceId,
      brainId,
      sourceId,
      fromEntityId,
      toEntityId: entity.id,
      relationshipType,
      confidenceScore: item.confidenceScore,
    });
    await BrainFactModel.create({
      workspaceId,
      brainId,
      entityId: entity.id,
      sourceId,
      sourceUrl,
      factType,
      factValue: item.name,
      confidenceScore: item.confidenceScore,
      lastVerifiedAt: new Date(),
      freshnessScore: 1,
    });
    counters.created += 1;
  }

  for (const fact of existingFacts) {
    if (newKeys.has(fact.factValue.trim().toLowerCase())) continue;
    if (fact.verificationStatus === "CORRECT") continue;
    if (fact.freshnessScore === 0) continue;
    await BrainFactModel.updateOne({ _id: fact.id }, { freshnessScore: 0 });
    counters.expired += 1;
  }
}

export type BrainRefreshResult = {
  changed: boolean;
  created: number;
  updated: number;
  expired: number;
  flagged: number;
  error?: string;
};

/**
 * Refreshes an already-built Business Brain: re-checks the workspace's
 * website, and if (and only if) the homepage or its identified pages
 * actually changed since the last check, re-runs product/service discovery
 * (`generateProductServices` — already preserves APPROVED rows) and
 * competitor identification, then reconciles every fact category against the
 * current CompanyProfile/ProductService/onboarding state. Skipping the two
 * Claude calls entirely when nothing changed is the concrete form "detect
 * changed pages" takes here — it's a cost gate, not just a label.
 *
 * User-verified CORRECT facts are never silently overwritten: a differing
 * re-extracted value flags the fact NEEDS_REVIEW with the proposal kept in
 * `pendingFactValue` instead. Everything else (unverified/incorrect/
 * needs-review facts, and list items no longer found) updates or expires
 * normally. Site-fetch failures are recorded on the BrainUpdateRun and
 * returned as a soft error rather than thrown, matching `buildInitialBrain`'s
 * best-effort posture — but a brain that isn't built yet, or has no website
 * to check, throws immediately (nothing to run).
 */
export async function refreshBrain(
  workspaceId: string,
  userId: string | null,
  trigger: BrainUpdateTrigger = "MANUAL",
): Promise<BrainRefreshResult> {
  await dbConnect();
  const brain = await BusinessBrainModel.findOne({ workspaceId });
  if (!brain || brain.status === "INITIALIZING") {
    throw new BrainNotReadyError("Build the initial Business Brain before refreshing it.");
  }

  const canStart = await canStartNewAnalysis(workspaceId);
  if (!canStart) {
    throw new BrainRefreshCooldownError("A website check ran recently for this workspace — wait a minute before refreshing again.");
  }

  const [onboarding, previousAnalysis] = await Promise.all([
    WorkspaceOnboarding.findOne({ workspaceId }),
    WebsiteAnalysis.findOne({ workspaceId, status: "COMPLETED" }).sort({ createdAt: -1 }),
  ]);

  const url = onboarding?.companyWebsite || previousAnalysis?.url;
  if (!url) {
    throw new BrainNotReadyError("This workspace has no analyzed website to refresh from.");
  }

  const run = await BrainUpdateRunModel.create({
    workspaceId,
    brainId: brain.id,
    status: "RUNNING",
    trigger,
    triggeredByUserId: userId,
    startedAt: new Date(),
  });

  const counters: FactCounters = { created: 0, updated: 0, expired: 0, flagged: 0 };

  try {
    const analysis = await runAndStoreWebsiteAnalysis(workspaceId, url);
    if (analysis.status !== "COMPLETED") {
      throw new Error(analysis.error ?? "Could not re-check the website.");
    }

    const homepageChanged = !previousAnalysis || previousAnalysis.visibleText !== analysis.visibleText;
    const pagesChanged =
      !previousAnalysis || JSON.stringify(previousAnalysis.identifiedPages) !== JSON.stringify(analysis.identifiedPages);

    if (!homepageChanged && !pagesChanged) {
      await Promise.all([
        BusinessBrainModel.updateOne({ _id: brain.id }, { status: "ACTIVE", lastUpdatedAt: new Date() }),
        BrainUpdateRunModel.updateOne({ _id: run.id }, { status: "COMPLETED", completedAt: new Date() }),
      ]);
      return { changed: false, ...counters };
    }

    // Best-effort: a discovery failure shouldn't sink the rest of the refresh.
    await generateProductServices(workspaceId).catch(() => null);

    const [profile, products, workspace] = await Promise.all([
      CompanyProfile.findOne({ workspaceId }),
      ProductService.find({ workspaceId, status: { $ne: "REJECTED" } }),
      Workspace.findById(workspaceId),
    ]);
    if (!workspace) {
      throw new Error("This workspace no longer exists.");
    }

    const targetCountryNames = (onboarding?.targetCountries ?? []).map(countryName);
    const countryNames = dedupe([...(profile?.countriesServed ?? []), ...targetCountryNames]);
    const targetIndustries = dedupe(products.flatMap((p) => p.targetIndustries));
    const buyerTypes = dedupe(products.flatMap((p) => p.buyerTypes));
    const keywords = dedupe(products.flatMap((p) => p.keywords));
    const applications = dedupe(products.flatMap((p) => p.applications));
    const projectKeywords = dedupe(products.flatMap((p) => p.projectKeywords));
    const tenderKeywords = dedupe(products.flatMap((p) => p.tenderKeywords));
    const vendorRegistrationKeywords = dedupe(products.flatMap((p) => p.vendorRegistrationKeywords));

    const competitors = profile
      ? await identifyCompetitors({
          companyName: profile.companyName || workspace.name,
          industry: profile.industry ?? "",
          businessDescription: profile.businessDescription ?? "",
          keyProductsServices: profile.keyProductsServices,
          countriesServed: countryNames,
        })
      : [];

    // The self entity is always the first ORGANIZATION entity created for this
    // brain — buildInitialBrain creates it before any competitor entities,
    // and refresh never creates a second one.
    const selfEntity = await BrainEntityModel.findOne({ workspaceId, brainId: brain.id, entityType: "ORGANIZATION" }).sort({
      createdAt: 1,
    });
    if (!selfEntity) {
      throw new Error("This workspace's Business Brain is missing its company entity.");
    }

    // Not wrapped in a DB transaction — standalone MongoDB (no replica set)
    // doesn't support multi-document transactions; acceptable for an MVP.
    const source = await BrainSourceModel.create({
      workspaceId,
      brainId: brain.id,
      websiteAnalysisId: analysis.id,
      sourceType: "WEBSITE_PAGE",
      url: analysis.url,
      title: analysis.title,
      fetchedAt: analysis.fetchedAt,
    });

    const scalarInputs: [BrainFactType, string | null][] = [
      ["COMPANY_NAME", profile?.companyName || null],
      ["BUSINESS_DESCRIPTION", profile?.businessDescription || null],
      ["INDUSTRY", profile?.industry || null],
      ["BUSINESS_MODEL", profile?.businessModel || null],
      ["HEADQUARTERS", profile?.headquarters || null],
      [
        "OPERATION_TYPE",
        profile && profile.operationType !== "UNKNOWN"
          ? OPERATION_TYPE_LABELS[profile.operationType as keyof typeof OPERATION_TYPE_LABELS]
          : null,
      ],
    ];
    for (const [factType, value] of scalarInputs) {
      await reconcileScalarFact({
        workspaceId,
        brainId: brain.id,
        entityId: selfEntity.id,
        factType,
        newValue: value,
        confidenceScore: profile?.confidenceScore ?? 0,
        sourceId: source.id,
        sourceUrl: source.url,
        counters,
      });
    }

    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "COUNTRY_SERVED",
      newValues: countryNames,
      confidenceScore: profile?.confidenceScore ?? 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "TARGET_INDUSTRY",
      newValues: targetIndustries,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "BUYER_TYPE",
      newValues: buyerTypes,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "KEYWORD",
      newValues: keywords,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "APPLICATION",
      newValues: applications,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "PROJECT_KEYWORD",
      newValues: projectKeywords,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "TENDER_KEYWORD",
      newValues: tenderKeywords,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });
    await reconcileListFacts({
      workspaceId,
      brainId: brain.id,
      factType: "VENDOR_REGISTRATION_KEYWORD",
      newValues: vendorRegistrationKeywords,
      confidenceScore: 0,
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });

    if (profile) {
      await reconcileEntityLinkedFacts({
        workspaceId,
        brainId: brain.id,
        factType: "CERTIFICATION",
        entityType: "CERTIFICATION",
        relationshipType: "CERTIFIED_BY",
        fromEntityId: selfEntity.id,
        items: dedupe(profile.certifications).map((name) => ({ name, confidenceScore: profile.confidenceScore })),
        sourceId: source.id,
        sourceUrl: source.url,
        counters,
      });
    }

    await reconcileEntityLinkedFacts({
      workspaceId,
      brainId: brain.id,
      factType: "PRODUCT_OR_SERVICE",
      entityType: "PRODUCT",
      relationshipType: "OFFERS",
      fromEntityId: selfEntity.id,
      items: products.map((p) => ({ name: p.name, description: p.description, confidenceScore: p.confidenceScore })),
      sourceId: source.id,
      sourceUrl: source.url,
      counters,
    });

    await reconcileEntityLinkedFacts({
      workspaceId,
      brainId: brain.id,
      factType: "COMPETITOR",
      entityType: "ORGANIZATION",
      relationshipType: "COMPETES_WITH",
      fromEntityId: selfEntity.id,
      items: competitors.map((c) => ({ name: c.name, description: c.reason, confidenceScore: c.confidenceScore })),
      sourceId: null,
      sourceUrl: null,
      counters,
    });

    await Promise.all([
      BusinessBrainModel.updateOne({ _id: brain.id }, { status: "ACTIVE", lastUpdatedAt: new Date() }),
      BrainUpdateRunModel.updateOne(
        { _id: run.id },
        {
          status: "COMPLETED",
          completedAt: new Date(),
          factsCreated: counters.created,
          factsUpdated: counters.updated,
          factsExpired: counters.expired,
          factsFlagged: counters.flagged,
        },
      ),
    ]);

    return { changed: true, ...counters };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error refreshing the Business Brain.";
    await BrainUpdateRunModel.updateOne({ _id: run.id }, { status: "FAILED", error: message, completedAt: new Date() });
    return { changed: false, ...counters, error: message };
  }
}
