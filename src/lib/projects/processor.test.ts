import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/ai-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-extraction")>();
  return {
    ...actual,
    extractProjectCandidateAI: vi.fn((result: { title: string }, context: unknown) => {
      if (result.title.includes("BROKEN")) {
        return Promise.reject(new actual.AIExtractionValidationError("forced failure for test"));
      }
      return actual.extractProjectCandidateAI(result as never, context as never);
    }),
  };
});

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, RawSearchResult, ProjectOpportunity } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processProjectResults } = await import("./processor");

await dbConnect();

const TEST_PREFIX = "vitest-projects-processor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    RawSearchResult.deleteMany({ workspaceId }),
    ProjectOpportunity.deleteMany({ workspaceId }),
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
    searchType: "PROJECT",
    query: "oil & gas EPC award USA",
    title: "Acme Refining | New Refinery Expansion Announced in Texas",
    snippet: "Acme Refining announced a new refinery expansion project in Texas, awarded to BuildCo EPC, expected completion 2027.",
    url: "https://acmerefining.example.com/news/expansion",
    domain: "acmerefining.example.com",
    country: "USA",
    language: "en",
    sourceProvider: "MOCK",
    retrievedAt: new Date(),
    processedStatus: "UNPROCESSED",
    extractionStatus: "NOT_STARTED",
    ...overrides,
  };
}

describe("processProjectResults", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Processor" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Processor Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Processor Co",
      industry: "Manufacturing",
      countriesServed: ["USA"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["EPC Contractor"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);

    const otherWorkspace = await createWorkspaceWithOwner("Processor Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("creates a ProjectOpportunity from a relevant raw result and marks it extracted", async () => {
    const raw = await RawSearchResult.create(makeRawResult(workspaceId));

    const summary = await processProjectResults(workspaceId, { batchSize: 10 });

    expect(summary.projectsCreated).toBe(1);
    expect(summary.rawResultsProcessed).toBeGreaterThan(0);

    const project = await ProjectOpportunity.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(project).not.toBeNull();
    expect(project?.clientName).toBe("Acme Refining");
    expect(project?.contractorName).toBe("BuildCo EPC");
    expect(project?.projectStage).toBe("AWARDED");
    expect(project?.score).toBeGreaterThan(0);
    expect(project?.priority).not.toBeNull();
    expect(project?.status).toBe("NEW");

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it("skips an irrelevant result (directory/social domain) without creating a project", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "Acme Refining - LinkedIn",
        domain: "www.linkedin.com",
        url: "https://www.linkedin.com/company/acme-refining",
      }),
    );

    await processProjectResults(workspaceId, { batchSize: 10 });

    const project = await ProjectOpportunity.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(project).toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
  });

  it("updates the existing project instead of creating a duplicate when the project-information link repeats", async () => {
    await RawSearchResult.create(makeRawResult(workspaceId, { url: "https://acmerefining.example.com/news/expansion" }));
    await processProjectResults(workspaceId, { batchSize: 10 });
    const firstCount = await ProjectOpportunity.countDocuments({ workspaceId, projectInformationLink: "https://acmerefining.example.com/news/expansion" });
    expect(firstCount).toBe(1);

    await RawSearchResult.create(
      makeRawResult(workspaceId, {
        url: "https://acmerefining.example.com/news/expansion",
        snippet: "Acme Refining's new refinery expansion, located in Houston, Texas, awarded to BuildCo EPC.",
      }),
    );
    const summary = await processProjectResults(workspaceId, { batchSize: 10 });
    expect(summary.projectsUpdated).toBeGreaterThanOrEqual(1);

    const sameLinkCount = await ProjectOpportunity.countDocuments({ workspaceId, projectInformationLink: "https://acmerefining.example.com/news/expansion" });
    expect(sameLinkCount).toBe(1);

    const project = await ProjectOpportunity.findOne({ workspaceId, projectInformationLink: "https://acmerefining.example.com/news/expansion" });
    expect(project?.sourceHistory.length).toBeGreaterThanOrEqual(2);
  });

  it("logs a failed extraction and continues processing the rest of the batch", async () => {
    const broken = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "BROKEN Corp | Test", url: "https://broken-corp.example.com", domain: "broken-corp.example.com" }),
    );
    const healthy = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "Healthy Corp | New Plant", url: "https://healthy-corp.example.com/plant", domain: "healthy-corp.example.com" }),
    );

    const summary = await processProjectResults(workspaceId, { batchSize: 10 });

    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const brokenRaw = await RawSearchResult.findById(broken.id);
    expect(brokenRaw?.processedStatus).toBe("FAILED");
    expect(brokenRaw?.extractionStatus).toBe("FAILED");

    const healthyRaw = await RawSearchResult.findById(healthy.id);
    expect(healthyRaw?.processedStatus).toBe("PROCESSED");

    const healthyProject = await ProjectOpportunity.findOne({ workspaceId, rawSearchResultId: healthy.id });
    expect(healthyProject).not.toBeNull();
  });

  it("is workspace-isolated — never processes another workspace's raw results", async () => {
    const raw = await RawSearchResult.create(makeRawResult(otherWorkspaceId, { url: "https://otherco.example.com", domain: "otherco.example.com" }));

    await processProjectResults(workspaceId, { batchSize: 10 });

    const untouched = await RawSearchResult.findById(raw.id);
    expect(untouched?.processedStatus).toBe("UNPROCESSED");
    const project = await ProjectOpportunity.findOne({ workspaceId: otherWorkspaceId });
    expect(project).toBeNull();
  });
});
