import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// @/lib/workspace imports @/auth (next-auth) and next/headers/next/navigation
// transitively, none of which resolve/work outside a live Next.js request —
// mocked here even though this file never calls auth()/cookies()/redirect()
// itself. Same reasoning as src/lib/workspace.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// refreshBrain re-checks the workspace's website via these — mocked so the
// test exercises fact reconciliation without a real network fetch. Every
// mocked run reports COMPLETED with no prior analysis to compare against, so
// refreshBrain always treats it as "changed" and runs reconciliation.
const mockCanStartNewAnalysis = vi.fn(async () => true);
const mockRunAndStoreWebsiteAnalysis = vi.fn(async (workspaceId: string, url: string) => ({
  id: "mock-analysis-id",
  workspaceId,
  url,
  status: "COMPLETED",
  visibleText: "mock refreshed homepage content",
  identifiedPages: {},
  title: "Mock Title",
  fetchedAt: new Date(),
}));
vi.mock("@/lib/website-analysis", () => ({
  canStartNewAnalysis: mockCanStartNewAnalysis,
  runAndStoreWebsiteAnalysis: mockRunAndStoreWebsiteAnalysis,
}));

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  CompanyProfile,
  ProductService,
  WorkspaceOnboarding,
  BusinessBrain,
  BrainFact,
  BrainEntity,
  BrainRelationship,
  BrainSource,
  BrainUpdateRun,
  BrainFeedback,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  buildInitialBrain,
  refreshBrain,
  getBusinessBrain,
  listBrainFacts,
  markFactVerification,
  recordFeedback,
  getFeedbackCountsByFact,
  BrainFactNotFoundError,
  BrainFeedbackTargetError,
} = await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-business-brain-";

describe("business-brain service", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Business Brain" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Business Brain Co", userId);
    workspaceId = workspace.id;

    // buildInitialBrain aggregates CompanyProfile + ProductService + onboarding
    // target countries — seed enough of each for a meaningful fact set.
    await CompanyProfile.create({
      workspaceId,
      companyName: "Acme Pumps",
      businessDescription: "Industrial pump manufacturer.",
      industry: "Manufacturing",
      businessModel: "B2B",
      countriesServed: ["United States"],
      headquarters: "Ohio, USA",
      operationType: "MANUFACTURER",
      certifications: ["ISO 9001"],
      keyProductsServices: ["Centrifugal Pumps"],
      confidenceScore: 0.9,
      sourceUrls: ["https://acme.com"],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      category: "Pumps",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["OEM"],
      keywords: ["pump"],
      applications: ["Water treatment"],
      projectKeywords: ["pump installation"],
      tenderKeywords: ["pump supply tender"],
      vendorRegistrationKeywords: ["pump vendor registration"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
  });

  afterAll(async () => {
    // Mongoose has no Prisma-style cascade delete — clean up every Brain*
    // row this test tree creates, not just the Workspace/User, so it
    // doesn't leak orphaned documents into the shared database.
    await Promise.all([
      BusinessBrain.deleteMany({ workspaceId }),
      BrainFact.deleteMany({ workspaceId }),
      BrainEntity.deleteMany({ workspaceId }),
      BrainRelationship.deleteMany({ workspaceId }),
      BrainSource.deleteMany({ workspaceId }),
      BrainUpdateRun.deleteMany({ workspaceId }),
      BrainFeedback.deleteMany({ workspaceId }),
      WorkspaceOnboarding.deleteOne({ workspaceId }),
      CompanyProfile.deleteOne({ workspaceId }),
      ProductService.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("buildInitialBrain populates facts from the company profile and product catalog", async () => {
    const brain = await buildInitialBrain(workspaceId);
    expect(brain.status).not.toBe("INITIALIZING");

    const facts = await listBrainFacts(workspaceId);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.some((f) => f.factType === "COMPANY_NAME" && f.factValue === "Acme Pumps")).toBe(true);
    expect(facts.some((f) => f.factType === "PRODUCT_OR_SERVICE" && f.factValue === "Centrifugal Pump")).toBe(true);
    expect(facts.some((f) => f.factType === "TARGET_INDUSTRY" && f.factValue === "Oil & Gas")).toBe(true);
  });

  it("buildInitialBrain also populates applications, project/tender/vendor-registration keyword facts", async () => {
    const facts = await listBrainFacts(workspaceId);
    expect(facts.some((f) => f.factType === "APPLICATION" && f.factValue === "Water treatment")).toBe(true);
    expect(facts.some((f) => f.factType === "PROJECT_KEYWORD" && f.factValue === "pump installation")).toBe(true);
    expect(facts.some((f) => f.factType === "TENDER_KEYWORD" && f.factValue === "pump supply tender")).toBe(true);
    expect(
      facts.some((f) => f.factType === "VENDOR_REGISTRATION_KEYWORD" && f.factValue === "pump vendor registration"),
    ).toBe(true);
  });

  it("buildInitialBrain creates a BrainRelationship linking the company to each product it offers", async () => {
    const brain = await getBusinessBrain(workspaceId);
    const selfEntity = await BrainEntity.findOne({ workspaceId, entityType: "ORGANIZATION" }).sort({ createdAt: 1 });
    const productEntity = await BrainEntity.findOne({ workspaceId, entityType: "PRODUCT", name: "Centrifugal Pump" });
    expect(selfEntity).not.toBeNull();
    expect(productEntity).not.toBeNull();

    const relationship = await BrainRelationship.findOne({
      workspaceId,
      brainId: brain?.id,
      fromEntityId: selfEntity?.id,
      toEntityId: productEntity?.id,
    });
    expect(relationship).not.toBeNull();
    expect(relationship?.relationshipType).toBe("OFFERS");
  });

  it("is idempotent — calling it again on an already-built brain is a no-op", async () => {
    const before = await listBrainFacts(workspaceId);
    await buildInitialBrain(workspaceId);
    const after = await listBrainFacts(workspaceId);
    expect(after.length).toBe(before.length);
  });

  it("getBusinessBrain returns the built brain", async () => {
    const brain = await getBusinessBrain(workspaceId);
    expect(brain).not.toBeNull();
    expect(brain?.workspaceId).toBe(workspaceId);
  });

  it("markFactVerification marks a fact CORRECT and bumps freshnessScore", async () => {
    const [fact] = await listBrainFacts(workspaceId);
    const updated = await markFactVerification(workspaceId, fact.id, userId, "CORRECT");
    expect(updated.verificationStatus).toBe("CORRECT");
    expect(updated.verifiedByUserId).toBe(userId);
    expect(updated.freshnessScore).toBe(1);
    expect(updated.lastVerifiedAt).not.toBeNull();
  });

  it("markFactVerification throws for a fact id from another workspace", async () => {
    await expect(markFactVerification(workspaceId, "not-a-real-fact-id", userId, "CORRECT")).rejects.toThrow(
      BrainFactNotFoundError,
    );
  });

  it("recordFeedback stores feedback tied to a fact, and getFeedbackCountsByFact tallies it", async () => {
    const [fact] = await listBrainFacts(workspaceId);
    await recordFeedback(workspaceId, userId, { feedbackType: "CORRECT_PRODUCT", factId: fact.id });
    await recordFeedback(workspaceId, userId, { feedbackType: "INCORRECT_PRODUCT", factId: fact.id });

    const counts = await getFeedbackCountsByFact(workspaceId, [fact.id]);
    expect(counts.get(fact.id)).toEqual({ positive: 1, negative: 1 });
  });

  it("recordFeedback rejects a factId that doesn't belong to this workspace", async () => {
    await expect(
      recordFeedback(workspaceId, userId, { feedbackType: "GOOD_LEAD", factId: "not-a-real-fact-id" }),
    ).rejects.toThrow(BrainFeedbackTargetError);
  });

  it("refreshBrain preserves a user-approved fact instead of overwriting it, flagging NEEDS_REVIEW", async () => {
    await WorkspaceOnboarding.create({ workspaceId, companyWebsite: "https://acme-pumps.example.com" });

    const facts = await listBrainFacts(workspaceId);
    const industryFact = facts.find((f) => f.factType === "INDUSTRY");
    expect(industryFact).toBeDefined();
    await markFactVerification(workspaceId, industryFact!.id, userId, "CORRECT");

    // Change the underlying source value so refresh sees a conflict.
    await CompanyProfile.updateOne({ workspaceId }, { industry: "Advanced Manufacturing" });

    const result = await refreshBrain(workspaceId, userId, "MANUAL");
    expect(result.changed).toBe(true);
    expect(result.flagged).toBeGreaterThan(0);

    const updatedFacts = await listBrainFacts(workspaceId);
    const stillIndustryFact = updatedFacts.find((f) => f.id === industryFact!.id);
    expect(stillIndustryFact?.factValue).toBe("Manufacturing");
    expect(stillIndustryFact?.verificationStatus).toBe("NEEDS_REVIEW");
    expect(stillIndustryFact?.pendingFactValue).toBe("Advanced Manufacturing");
  });

  it("recordFeedback accepts a freeform subjectLabel with no fact/entity", async () => {
    const feedback = await recordFeedback(workspaceId, userId, {
      feedbackType: "GOOD_LEAD",
      subjectLabel: "Some Prospect Inc",
    });
    expect(feedback.subjectLabel).toBe("Some Prospect Inc");
  });
});
