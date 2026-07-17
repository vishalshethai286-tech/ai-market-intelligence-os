import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/ai-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-extraction")>();
  return {
    ...actual,
    extractVendorRegistrationCandidateAI: vi.fn((result: { title: string }, context: unknown) => {
      if (result.title.includes("BROKEN")) {
        return Promise.reject(new actual.AIExtractionValidationError("forced failure for test"));
      }
      return actual.extractVendorRegistrationCandidateAI(result as never, context as never);
    }),
  };
});

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, RawSearchResult, VendorRegistration, TargetCustomer } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processVendorRegistrationResults } = await import("./processor");

await dbConnect();

const TEST_PREFIX = "vitest-vendor-registrations-processor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    RawSearchResult.deleteMany({ workspaceId }),
    VendorRegistration.deleteMany({ workspaceId }),
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
    searchType: "VENDOR_REGISTRATION",
    query: "supplier registration UAE",
    title: "Supplier Registration | ADNOC",
    snippet: "Company profile, ISO certificate, and trade license are required for supplier registration.",
    url: "https://adnoc-processor-test.example.com/suppliers/register",
    domain: "adnoc-processor-test.example.com",
    country: "United Arab Emirates",
    language: "en",
    sourceProvider: "MOCK",
    retrievedAt: new Date(),
    processedStatus: "UNPROCESSED",
    extractionStatus: "NOT_STARTED",
    ...overrides,
  };
}

describe("processVendorRegistrationResults", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Vendor Registration Processor" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Vendor Registration Processor Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Vendor Registration Processor Co",
      industry: "Manufacturing",
      countriesServed: ["United Arab Emirates"],
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

    const otherWorkspace = await createWorkspaceWithOwner("Vendor Registration Processor Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("creates a VendorRegistration from a relevant raw result, marks it extracted, and creates a linked TargetCustomer", async () => {
    const raw = await RawSearchResult.create(makeRawResult(workspaceId));

    const summary = await processVendorRegistrationResults(workspaceId, { batchSize: 10 });

    expect(summary.rawResultsProcessed).toBeGreaterThan(0);
    expect(summary.vendorRegistrationsCreated).toBe(1);
    expect(summary.customersCreated).toBeGreaterThanOrEqual(1);

    const registration = await VendorRegistration.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(registration).not.toBeNull();
    expect(registration?.customerName).toBe("ADNOC");
    expect(registration?.registrationType).toBe("Supplier Portal");
    expect(registration?.requiredDocuments.length).toBeGreaterThan(0);
    expect(registration?.status).toBe("NEW");

    const customer = await TargetCustomer.findOne({ workspaceId, customerName: "ADNOC" });
    expect(customer).not.toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it("links to an existing TargetCustomer with the same website domain instead of creating a duplicate one", async () => {
    await TargetCustomer.create({
      workspaceId,
      customerName: "SABIC",
      websiteDomain: "sabic-processor-test.example.com",
      country: "Saudi Arabia",
      rawSearchResultId: "raw-existing",
      discoveryRunId: "run-existing",
      sourceHistory: [],
      status: "NEW",
    });

    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "Become a Supplier | SABIC",
        snippet: "SABIC invites qualified suppliers to join our vendor network.",
        url: "https://sabic-processor-test.example.com/become-a-supplier",
        domain: "sabic-processor-test.example.com",
        country: "Saudi Arabia",
      }),
    );

    const summary = await processVendorRegistrationResults(workspaceId, { batchSize: 10 });
    expect(summary.linkedCustomers).toBeGreaterThanOrEqual(1);

    const customerCount = await TargetCustomer.countDocuments({ workspaceId, customerName: "SABIC" });
    expect(customerCount).toBe(1);

    const registration = await VendorRegistration.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(registration?.registrationType).toBe("Vendor Onboarding");
  });

  it("skips an irrelevant result (directory/social domain) without creating a registration", async () => {
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, {
        title: "ADNOC - LinkedIn",
        domain: "www.linkedin.com",
        url: "https://www.linkedin.com/company/adnoc",
      }),
    );

    await processVendorRegistrationResults(workspaceId, { batchSize: 10 });

    const registration = await VendorRegistration.findOne({ workspaceId, rawSearchResultId: raw.id });
    expect(registration).toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
  });

  it("updates the existing registration instead of creating a duplicate when the vendor registration link repeats", async () => {
    const repeatUrl = "https://repeat-link-vendor-test.example.com/register";
    await RawSearchResult.create(
      makeRawResult(workspaceId, { url: repeatUrl, domain: "repeat-link-vendor-test.example.com" }),
    );
    await processVendorRegistrationResults(workspaceId, { batchSize: 10 });
    const firstCount = await VendorRegistration.countDocuments({ workspaceId, vendorRegistrationLink: repeatUrl });
    expect(firstCount).toBe(1);

    await RawSearchResult.create(
      makeRawResult(workspaceId, {
        url: repeatUrl,
        domain: "repeat-link-vendor-test.example.com",
        snippet: "Updated: certificate of incorporation and bank reference letter are also required.",
      }),
    );
    const summary = await processVendorRegistrationResults(workspaceId, { batchSize: 10 });
    expect(summary.vendorRegistrationsUpdated).toBeGreaterThanOrEqual(1);

    const sameLinkCount = await VendorRegistration.countDocuments({ workspaceId, vendorRegistrationLink: repeatUrl });
    expect(sameLinkCount).toBe(1);

    const registration = await VendorRegistration.findOne({ workspaceId, vendorRegistrationLink: repeatUrl });
    expect(registration?.sourceHistory.length).toBeGreaterThanOrEqual(2);
  });

  it("logs a failed extraction and continues processing the rest of the batch", async () => {
    const broken = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "BROKEN Vendor | Test", url: "https://broken-vendor.example.com", domain: "broken-vendor.example.com" }),
    );
    const healthy = await RawSearchResult.create(
      makeRawResult(workspaceId, { title: "Vendor Registration | Healthy Corp", url: "https://healthy-vendor.example.com/register", domain: "healthy-vendor.example.com" }),
    );

    const summary = await processVendorRegistrationResults(workspaceId, { batchSize: 10 });

    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const brokenRaw = await RawSearchResult.findById(broken.id);
    expect(brokenRaw?.processedStatus).toBe("FAILED");
    expect(brokenRaw?.extractionStatus).toBe("FAILED");

    const healthyRaw = await RawSearchResult.findById(healthy.id);
    expect(healthyRaw?.processedStatus).toBe("PROCESSED");

    const healthyRegistration = await VendorRegistration.findOne({ workspaceId, rawSearchResultId: healthy.id });
    expect(healthyRegistration).not.toBeNull();
  });

  it("is workspace-isolated — never processes another workspace's raw results", async () => {
    const raw = await RawSearchResult.create(makeRawResult(otherWorkspaceId, { url: "https://otherco-vendor.example.com", domain: "otherco-vendor.example.com" }));

    await processVendorRegistrationResults(workspaceId, { batchSize: 10 });

    const untouched = await RawSearchResult.findById(raw.id);
    expect(untouched?.processedStatus).toBe("UNPROCESSED");
    const registration = await VendorRegistration.findOne({ workspaceId: otherWorkspaceId });
    expect(registration).toBeNull();
  });
});
