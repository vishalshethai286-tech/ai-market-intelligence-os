import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/ai-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-extraction")>();
  return {
    ...actual,
    extractCustomerCandidateAI: vi.fn((result: { title: string }, context: unknown) => {
      if (result.title.includes("BROKEN")) {
        return Promise.reject(new actual.AIExtractionValidationError("forced failure for test"));
      }
      return actual.extractCustomerCandidateAI(result as never, context as never);
    }),
  };
});

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, RawSearchResult, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processCustomerResults } = await import("./processor");

await dbConnect();

const TEST_PREFIX = "vitest-customers-processor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    RawSearchResult.deleteMany({ workspaceId }),
    TargetCustomer.deleteMany({ workspaceId }),
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
    searchType: "CUSTOMER",
    query: "industrial pump manufacturer USA",
    title: "ABC Pumps | Industrial Pump Manufacturer USA",
    snippet: "ABC Pumps has been manufacturing centrifugal pumps in the USA since 1990.",
    url: "https://abcpumps.com/about",
    domain: "abcpumps.com",
    country: "USA",
    language: "en",
    sourceProvider: "MOCK",
    retrievedAt: new Date(),
    processedStatus: "UNPROCESSED",
    extractionStatus: "NOT_STARTED",
    ...overrides,
  };
}

describe("processCustomerResults", () => {
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
      buyerTypes: ["Manufacturer"],
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

  it("creates a TargetCustomer from a relevant raw result and marks it extracted", async () => {
    const raw = await RawSearchResult.create(makeRawResult(workspaceId));

    const summary = await processCustomerResults(workspaceId, { batchSize: 10 });

    expect(summary.customersCreated).toBe(1);
    expect(summary.rawResultsProcessed).toBeGreaterThan(0);

    const customer = await TargetCustomer.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(customer).not.toBeNull();
    expect(customer?.customerName).toBe("ABC Pumps");
    expect(customer?.websiteDomain).toBe("abcpumps.com");
    expect(customer?.score).toBeGreaterThan(0);
    expect(customer?.priority).not.toBeNull();
    expect(customer?.status).toBe("NEW");

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it("skips an irrelevant result (directory/social domain) without creating a customer", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "ABC Pumps - LinkedIn",
        domain: "www.linkedin.com",
        url: "https://www.linkedin.com/company/abc-pumps",
      }),
    );

    await processCustomerResults(workspaceId, { batchSize: 10 });

    const customer = await TargetCustomer.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(customer).toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
  });

  it("updates the existing customer instead of creating a duplicate when the domain repeats", async () => {
    await RawSearchResult.create(makeRawResult(workspaceId, { url: "https://abcpumps.com/first" }));
    await processCustomerResults(workspaceId, { batchSize: 10 });
    const firstCount = await TargetCustomer.countDocuments({ workspaceId, websiteDomain: "abcpumps.com" });
    expect(firstCount).toBe(1);

    await RawSearchResult.create(
      makeRawResult(workspaceId, {
        url: "https://abcpumps.com/second",
        snippet: "ABC Pumps, 123 Main St, Springfield, phone +1 555 000 1111.",
      }),
    );
    const summary = await processCustomerResults(workspaceId, { batchSize: 10 });
    expect(summary.customersUpdated).toBeGreaterThanOrEqual(1);

    const sameDomainCount = await TargetCustomer.countDocuments({ workspaceId, websiteDomain: "abcpumps.com" });
    expect(sameDomainCount).toBe(1);

    const customer = await TargetCustomer.findOne({ workspaceId, websiteDomain: "abcpumps.com" });
    expect(customer?.sourceHistory.length).toBeGreaterThanOrEqual(2);
  });

  it("logs a failed extraction and continues processing the rest of the batch", async () => {
    const broken = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "BROKEN Corp | Test", url: "https://broken-corp.example.com", domain: "broken-corp.example.com" }),
    );
    const healthy = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "Healthy Corp | Test", url: "https://healthy-corp.example.com", domain: "healthy-corp.example.com" }),
    );

    const summary = await processCustomerResults(workspaceId, { batchSize: 10 });

    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const brokenRaw = await RawSearchResult.findById(broken.id);
    expect(brokenRaw?.processedStatus).toBe("FAILED");
    expect(brokenRaw?.extractionStatus).toBe("FAILED");

    const healthyRaw = await RawSearchResult.findById(healthy.id);
    expect(healthyRaw?.processedStatus).toBe("PROCESSED");

    const healthyCustomer = await TargetCustomer.findOne({ workspaceId, rawSearchResultId: healthy.id });
    expect(healthyCustomer).not.toBeNull();
  });

  it("is workspace-isolated — never processes another workspace's raw results", async () => {
    const raw = await RawSearchResult.create(makeRawResult(otherWorkspaceId, { url: "https://otherco.example.com", domain: "otherco.example.com" }));

    await processCustomerResults(workspaceId, { batchSize: 10 });

    const untouched = await RawSearchResult.findById(raw.id);
    expect(untouched?.processedStatus).toBe("UNPROCESSED");
    const customer = await TargetCustomer.findOne({ workspaceId: otherWorkspaceId });
    expect(customer).toBeNull();
  });
});
