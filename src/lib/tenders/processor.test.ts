import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/ai-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-extraction")>();
  return {
    ...actual,
    extractTenderCandidateAI: vi.fn((result: { title: string }, context: unknown) => {
      if (result.title.includes("BROKEN")) {
        return Promise.reject(new actual.AIExtractionValidationError("forced failure for test"));
      }
      return actual.extractTenderCandidateAI(result as never, context as never);
    }),
  };
});

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, RawSearchResult, TenderBuyer, TenderOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processTenderResults } = await import("./processor");

await dbConnect();

const TEST_PREFIX = "vitest-tenders-processor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    RawSearchResult.deleteMany({ workspaceId }),
    TenderBuyer.deleteMany({ workspaceId }),
    TenderOpportunity.deleteMany({ workspaceId }),
    ProductService.deleteMany({ workspaceId }),
    CompanyProfile.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

function makeRawResult(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    discoveryRunId: "run-1",
    discoveryRunItemId: "item-1",
    searchQueryId: "query-1",
    searchQueueItemId: "queue-1",
    searchType: "TENDER",
    query: "stainless steel pipes tender USA",
    title: "Tender for Stainless Steel Pipes and Fittings",
    snippet: "Public Works Department invites bids for the supply of stainless steel pipes and fittings for a municipal water project.",
    url: "https://tenders.example.gov/pipes-2027",
    domain: "tenders.example.gov",
    country: "USA",
    language: "en",
    sourceProvider: "MOCK",
    retrievedAt: new Date(),
    processedStatus: "UNPROCESSED",
    extractionStatus: "NOT_STARTED",
    ...overrides,
  };
}

describe("processTenderResults", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Tender Processor" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Tender Processor Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Tender Processor Co",
      industry: "Manufacturing",
      countriesServed: ["USA"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Stainless Steel Pipes",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["Government"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);

    const otherWorkspace = await createWorkspaceWithOwner("Tender Processor Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("creates a TenderOpportunity from a relevant live-tender raw result and marks it extracted", async () => {
    const raw = await RawSearchResult.create(makeRawResult(workspaceId));

    const summary = await processTenderResults(workspaceId, { batchSize: 10 });

    expect(summary.rawResultsProcessed).toBeGreaterThan(0);
    expect(summary.tenderOpportunitiesCreated).toBe(1);

    const opportunity = await TenderOpportunity.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(opportunity).not.toBeNull();
    expect(opportunity?.tenderTitle).toBe("Stainless Steel Pipes and Fittings");
    expect(opportunity?.tenderLink).toBe("https://tenders.example.gov/pipes-2027");
    expect(opportunity?.status).toBe("NEW");
    expect(opportunity?.priorityScore).toBeGreaterThan(0);

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it("creates a TenderBuyer from a relevant buyer/procurement-portal raw result", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "Supplier Registration / Procurement Portal | Qatar Energy",
        snippet: "Qatar Energy invites suppliers to register on its procurement portal.",
        url: "https://qatarenergy-processor-test.example.com/suppliers",
        domain: "qatarenergy-processor-test.example.com",
        country: "Qatar",
      }),
    );

    const summary = await processTenderResults(workspaceId, { batchSize: 10 });

    expect(summary.tenderBuyersCreated).toBe(1);
    const buyer = await TenderBuyer.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(buyer).not.toBeNull();
    expect(buyer?.customerName).toBe("Qatar Energy");
    expect(buyer?.status).toBe("NEW");
  });

  it("creates both a TenderBuyer and a TenderOpportunity from one raw result when both are present", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "Tender for Structural Steel Supply | Procurement Portal Zeta Authority",
        snippet: "Zeta Authority invites bids for the tender for structural steel supply, closing next quarter. Register on our procurement portal.",
        url: "https://zeta-authority-processor-test.example.gov/tender-structural-steel",
        domain: "zeta-authority-processor-test.example.gov",
        country: "USA",
      }),
    );

    const summary = await processTenderResults(workspaceId, { batchSize: 10 });

    const buyer = await TenderBuyer.findOne({ workspaceId, rawSearchResultId: raw.id });
    const opportunity = await TenderOpportunity.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(buyer).not.toBeNull();
    expect(opportunity).not.toBeNull();
    expect(summary.tenderBuyersCreated).toBeGreaterThanOrEqual(1);
    expect(summary.tenderOpportunitiesCreated).toBeGreaterThanOrEqual(1);
  });

  it("skips an irrelevant result without creating a buyer or opportunity", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "Pipes and Fittings - LinkedIn",
        snippet: "Connect with professionals in the pipes and fittings industry.",
        domain: "www.linkedin.com",
        url: "https://www.linkedin.com/company/pipes-fittings",
      }),
    );

    await processTenderResults(workspaceId, { batchSize: 10 });

    const buyer = await TenderBuyer.findOne({ workspaceId, rawSearchResultId: raw.id });
    const opportunity = await TenderOpportunity.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(buyer).toBeNull();
    expect(opportunity).toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
  });

  it("updates the existing tender opportunity instead of creating a duplicate when the tender link repeats", async () => {
    await RawSearchResult.create(makeRawResult(workspaceId, { url: "https://tenders.example.gov/repeat-link-test" }));
    await processTenderResults(workspaceId, { batchSize: 10 });
    const firstCount = await TenderOpportunity.countDocuments({ workspaceId, tenderLink: "https://tenders.example.gov/repeat-link-test" });
    expect(firstCount).toBe(1);

    await RawSearchResult.create(
      makeRawResult(workspaceId, {
        url: "https://tenders.example.gov/repeat-link-test",
        snippet: "Public Works Department invites updated bids for the supply of stainless steel pipes and fittings.",
      }),
    );
    const summary = await processTenderResults(workspaceId, { batchSize: 10 });
    expect(summary.tenderOpportunitiesUpdated).toBeGreaterThanOrEqual(1);

    const sameLinkCount = await TenderOpportunity.countDocuments({ workspaceId, tenderLink: "https://tenders.example.gov/repeat-link-test" });
    expect(sameLinkCount).toBe(1);

    const opportunity = await TenderOpportunity.findOne({ workspaceId, tenderLink: "https://tenders.example.gov/repeat-link-test" });
    expect(opportunity?.sourceHistory.length).toBeGreaterThanOrEqual(2);
  });

  it("logs a failed extraction and continues processing the rest of the batch", async () => {
    const broken = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "BROKEN Tender | Test", url: "https://broken-tender.example.com", domain: "broken-tender.example.com" }),
    );
    const healthy = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "Tender for Healthy Widgets Supply", url: "https://healthy-tender.example.com/widgets", domain: "healthy-tender.example.com" }),
    );

    const summary = await processTenderResults(workspaceId, { batchSize: 10 });

    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const brokenRaw = await RawSearchResult.findById(broken.id);
    expect(brokenRaw?.processedStatus).toBe("FAILED");
    expect(brokenRaw?.extractionStatus).toBe("FAILED");

    const healthyRaw = await RawSearchResult.findById(healthy.id);
    expect(healthyRaw?.processedStatus).toBe("PROCESSED");

    const healthyOpportunity = await TenderOpportunity.findOne({ workspaceId, rawSearchResultId: healthy.id });
    expect(healthyOpportunity).not.toBeNull();
  });

  it("is workspace-isolated — never processes another workspace's raw results", async () => {
    const raw = await RawSearchResult.create(makeRawResult(otherWorkspaceId, { url: "https://otherco-tender.example.com", domain: "otherco-tender.example.com" }));

    await processTenderResults(workspaceId, { batchSize: 10 });

    const untouched = await RawSearchResult.findById(raw.id);
    expect(untouched?.processedStatus).toBe("UNPROCESSED");
    const opportunity = await TenderOpportunity.findOne({ workspaceId: otherWorkspaceId });
    expect(opportunity).toBeNull();
  });
});
