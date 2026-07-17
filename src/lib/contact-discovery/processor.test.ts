import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/ai-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-extraction")>();
  return {
    ...actual,
    extractPublicContactsAI: vi.fn((result: { title: string }, context: unknown) => {
      if (result.title.includes("BROKEN")) {
        return Promise.reject(new actual.AIExtractionValidationError("forced failure for test"));
      }
      return actual.extractPublicContactsAI(result as never, context as never);
    }),
  };
});

const { dbConnect } = await import("@/lib/mongodb");
const {
  User,
  Workspace,
  RawSearchResult,
  SearchQuery,
  ContactDiscoveryTarget,
  Contact,
  ContactActivity,
  ContactExtractionRun,
  TargetCustomer,
  ProjectOpportunity,
  TenderBuyer,
  TenderOpportunity,
  VendorRegistration,
} = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { processContactResults } = await import("./processor");

await dbConnect();

const TEST_PREFIX = "vitest-contact-discovery-processor-";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function cleanupWorkspace(workspaceId: string) {
  await Promise.all([
    RawSearchResult.deleteMany({ workspaceId }),
    SearchQuery.deleteMany({ workspaceId }),
    ContactDiscoveryTarget.deleteMany({ workspaceId }),
    Contact.deleteMany({ workspaceId }),
    ContactActivity.deleteMany({ workspaceId }),
    ContactExtractionRun.deleteMany({ workspaceId }),
    TargetCustomer.deleteMany({ workspaceId }),
    ProjectOpportunity.deleteMany({ workspaceId }),
    TenderBuyer.deleteMany({ workspaceId }),
    TenderOpportunity.deleteMany({ workspaceId }),
    VendorRegistration.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

function makeRawResult(workspaceId: string, searchQueryId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    discoveryRunId: "run-1",
    discoveryRunItemId: "item-1",
    searchQueryId,
    searchQueueItemId: "queue-1",
    searchType: "CONTACT",
    query: "ADNOC procurement contact",
    title: "Supplier Registration Contact | ADNOC",
    snippet: "",
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

describe("processContactResults", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Contact Discovery Processor Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Contact Discovery Processor Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Contact Discovery Processor Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await cleanupWorkspace(workspaceId);
    await cleanupWorkspace(otherWorkspaceId);
    await User.deleteOne({ _id: userId });
  });

  it("creates a Contact from a relevant raw result, links it to the originating TargetCustomer, and logs a VERIFICATION activity", async () => {
    const customer = await TargetCustomer.create({
      workspaceId,
      customerName: "ADNOC",
      country: "United Arab Emirates",
      rawSearchResultId: "raw-x",
      discoveryRunId: "run-x",
      sourceHistory: [],
      status: "NEW",
      duplicateStatus: "UNIQUE",
    });
    const target = await ContactDiscoveryTarget.create({
      workspaceId,
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: customer.id,
      companyName: "ADNOC",
      country: "United Arab Emirates",
    });
    const searchQuery = await SearchQuery.create({
      workspaceId,
      brainId: "brain-1",
      query: "ADNOC supplier registration contact",
      searchType: "CONTACT",
      relatedRecordType: "TARGET_CUSTOMER",
      relatedRecordId: customer.id,
      relatedCompanyName: "ADNOC",
    });
    const raw = await RawSearchResult.create(makeRawResult(workspaceId, searchQuery.id));

    const summary = await processContactResults(workspaceId, { batchSize: 10 });

    expect(summary.rawResultsProcessed).toBe(1);
    expect(summary.contactsCreated).toBeGreaterThanOrEqual(1);

    const contact = await Contact.findOne({ workspaceId, companyName: "ADNOC" });
    expect(contact).not.toBeNull();
    expect(contact?.relatedTargetCustomerId).toBe(customer.id);
    expect(contact?.sourceType).not.toBe("MANUAL_ENTRY");

    const activity = await ContactActivity.findOne({ workspaceId, contactId: contact?.id });
    expect(activity?.activityType).toBe("VERIFICATION");
    expect(activity?.description).toContain(raw.url);

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");

    const updatedTarget = await ContactDiscoveryTarget.findById(target.id);
    expect(updatedTarget?.contactsFound).toBeGreaterThanOrEqual(1);
    expect(updatedTarget?.status).toBe("CONTACTS_FOUND");
  });

  it("extracts multiple contacts (named + department) from a single raw result", async () => {
    const searchQuery = await SearchQuery.create({
      workspaceId,
      brainId: "brain-1",
      query: "Industrial Pumps Inc. management team",
      searchType: "CONTACT",
    });
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "Management Team | Industrial Pumps Inc.",
        snippet: "Contact John Doe, Plant Manager, or reach our Supplier Registration Team for vendor onboarding inquiries.",
        url: "https://industrialpumps-processor-test.example.com/team",
        domain: "industrialpumps-processor-test.example.com",
      }),
    );

    const summary = await processContactResults(workspaceId, { batchSize: 10 });
    expect(summary.contactsExtracted).toBeGreaterThanOrEqual(2);

    const johnDoe = await Contact.findOne({ workspaceId, fullName: "John Doe" });
    expect(johnDoe).not.toBeNull();
    const supplierTeam = await Contact.findOne({ workspaceId, fullName: "Supplier Registration Team" });
    expect(supplierTeam).not.toBeNull();

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it("updates the existing contact instead of creating a duplicate on a repeat sighting", async () => {
    const searchQuery = await SearchQuery.create({
      workspaceId,
      brainId: "brain-1",
      query: "ABC Pumps procurement manager",
      searchType: "CONTACT",
    });
    await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "Jane Smith, Procurement Manager | ABC Pumps",
        snippet: "",
        url: "https://abcpumps-processor-test.example.com/team",
        domain: "abcpumps-processor-test.example.com",
      }),
    );
    await processContactResults(workspaceId, { batchSize: 10 });
    const firstCount = await Contact.countDocuments({ workspaceId, fullName: "Jane Smith" });
    expect(firstCount).toBe(1);

    await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "Jane Smith, Procurement Manager | ABC Pumps",
        snippet: "Email jane.smith@abcpumps-processor-test.example.com",
        url: "https://abcpumps-processor-test.example.com/team-2",
        domain: "abcpumps-processor-test.example.com",
      }),
    );
    const summary = await processContactResults(workspaceId, { batchSize: 10 });
    expect(summary.contactsUpdated).toBeGreaterThanOrEqual(1);
    expect(summary.duplicatesFound).toBeGreaterThanOrEqual(1);

    const sameNameCount = await Contact.countDocuments({ workspaceId, fullName: "Jane Smith" });
    expect(sameNameCount).toBe(1);
  });

  it("skips an irrelevant result (no contact signal) without creating a Contact", async () => {
    const searchQuery = await SearchQuery.create({ workspaceId, brainId: "brain-1", query: "ADNOC annual report", searchType: "CONTACT" });
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "Annual Report 2026 | ADNOC",
        snippet: "Financial highlights for the year.",
        url: "https://adnoc-processor-test.example.com/annual-report",
      }),
    );

    await processContactResults(workspaceId, { batchSize: 10 });

    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");
    expect(updatedRaw?.processedStatus).toBe("PROCESSED");
  });

  it("never extracts a contact from a LinkedIn-domain result", async () => {
    const searchQuery = await SearchQuery.create({ workspaceId, brainId: "brain-1", query: "ADNOC linkedin", searchType: "CONTACT" });
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "ADNOC - Procurement Manager | LinkedIn",
        domain: "www.linkedin.com",
        url: "https://www.linkedin.com/in/some-procurement-manager",
      }),
    );

    await processContactResults(workspaceId, { batchSize: 10 });
    const updatedRaw = await RawSearchResult.findById(raw.id);
    expect(updatedRaw?.extractionStatus).toBe("SKIPPED");

    const contact = await Contact.findOne({ workspaceId, sourceUrl: raw.url });
    expect(contact).toBeNull();
  });

  it("logs a failed extraction and continues processing the rest of the batch", async () => {
    const searchQuery = await SearchQuery.create({ workspaceId, brainId: "brain-1", query: "broken contact query", searchType: "CONTACT" });
    const broken = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "BROKEN Contact | Test",
        url: "https://broken-contact.example.com",
        domain: "broken-contact.example.com",
      }),
    );
    const healthy = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: "Procurement Contacts | Healthy Corp",
        url: "https://healthy-contact.example.com",
        domain: "healthy-contact.example.com",
      }),
    );

    const summary = await processContactResults(workspaceId, { batchSize: 10 });
    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const brokenRaw = await RawSearchResult.findById(broken.id);
    expect(brokenRaw?.processedStatus).toBe("FAILED");
    expect(brokenRaw?.extractionStatus).toBe("FAILED");

    const healthyRaw = await RawSearchResult.findById(healthy.id);
    expect(healthyRaw?.processedStatus).toBe("PROCESSED");
    expect(healthyRaw?.extractionStatus).toBe("EXTRACTED");
  });

  it.each([
    ["PROJECT_OPPORTUNITY", ProjectOpportunity, "relatedProjectOpportunityId"],
    ["TENDER_BUYER", TenderBuyer, "relatedTenderBuyerId"],
    ["TENDER_OPPORTUNITY", TenderOpportunity, "relatedTenderOpportunityId"],
    ["VENDOR_REGISTRATION", VendorRegistration, "relatedVendorRegistrationId"],
  ] as const)("links a discovered contact back to a %s related record", async (relatedRecordType, Model, contactField) => {
    const nameField = relatedRecordType === "PROJECT_OPPORTUNITY" ? "clientName" : relatedRecordType === "TENDER_OPPORTUNITY" ? "buyerOrganization" : "customerName";
    const extraFields =
      relatedRecordType === "PROJECT_OPPORTUNITY"
        ? { projectName: "Some Project" }
        : relatedRecordType === "TENDER_OPPORTUNITY"
          ? { tenderTitle: "Some Tender" }
          : {};

    const record = await Model.create({
      workspaceId,
      [nameField]: `Link Test ${relatedRecordType}`,
      rawSearchResultId: `raw-link-${relatedRecordType}`,
      discoveryRunId: `run-link-${relatedRecordType}`,
      sourceHistory: [],
      status: "NEW",
      duplicateStatus: "UNIQUE",
      ...extraFields,
    });

    await ContactDiscoveryTarget.create({
      workspaceId,
      relatedRecordType,
      relatedRecordId: record.id,
      companyName: `Link Test ${relatedRecordType}`,
    });

    const searchQuery = await SearchQuery.create({
      workspaceId,
      brainId: "brain-1",
      query: `${relatedRecordType} link query`,
      searchType: "CONTACT",
      relatedRecordType,
      relatedRecordId: record.id,
      relatedCompanyName: `Link Test ${relatedRecordType}`,
    });
    const raw = await RawSearchResult.create(
      makeRawResult(workspaceId, searchQuery.id, {
        title: `Procurement Contacts | Link Test ${relatedRecordType}`,
        url: `https://link-test-${relatedRecordType.toLowerCase()}.example.com`,
        domain: `link-test-${relatedRecordType.toLowerCase()}.example.com`,
      }),
    );

    await processContactResults(workspaceId, { batchSize: 10 });

    const contact = await Contact.findOne({ workspaceId, sourceUrl: raw.url });
    expect(contact).not.toBeNull();
    expect((contact as unknown as Record<string, unknown>)?.[contactField]).toBe(record.id);
  });

  it("is workspace-isolated — never processes another workspace's raw contact results", async () => {
    const searchQuery = await SearchQuery.create({ workspaceId: otherWorkspaceId, brainId: "brain-1", query: "other workspace contact", searchType: "CONTACT" });
    const raw = await RawSearchResult.create(makeRawResult(otherWorkspaceId, searchQuery.id, { url: "https://otherco-contact.example.com", domain: "otherco-contact.example.com" }));

    await processContactResults(workspaceId, { batchSize: 10 });

    const untouched = await RawSearchResult.findById(raw.id);
    expect(untouched?.processedStatus).toBe("UNPROCESSED");
    const contact = await Contact.findOne({ workspaceId: otherWorkspaceId });
    expect(contact).toBeNull();
  });
});
