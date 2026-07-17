import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, ProjectOpportunity, RawSearchResult, CompanyProfile, ProductService } = await import("@/models");
const { createWorkspaceWithOwner, ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { processProjectResultsAction, updateProjectStatusAction, recordProjectFeedbackAction } = await import("./projects");

await dbConnect();

const TEST_PREFIX = "vitest-project-actions-";

describe("project actions", () => {
  let userId: string;
  let workspaceId: string;
  let prevEnableMockAI: string | undefined;

  beforeAll(async () => {
    prevEnableMockAI = process.env.ENABLE_MOCK_AI;
    process.env.ENABLE_MOCK_AI = "true";

    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Project Actions" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Project Actions Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Project Actions Co",
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

    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  afterAll(async () => {
    if (prevEnableMockAI === undefined) delete process.env.ENABLE_MOCK_AI;
    else process.env.ENABLE_MOCK_AI = prevEnableMockAI;
    await Promise.all([
      ProjectOpportunity.deleteMany({ workspaceId }),
      RawSearchResult.deleteMany({ workspaceId }),
      ProductService.deleteMany({ workspaceId }),
      CompanyProfile.deleteMany({ workspaceId }),
    ]);
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: (name: string) => (name === ACTIVE_WORKSPACE_COOKIE ? { value: workspaceId } : undefined) });
  });

  it("processProjectResultsAction turns a queued raw project result into a ProjectOpportunity", async () => {
    await RawSearchResult.create({
      workspaceId,
      discoveryRunId: "run-1",
      discoveryRunItemId: "item-1",
      searchQueryId: "query-1",
      searchQueueItemId: "queue-1",
      searchType: "PROJECT",
      query: "oil & gas EPC award USA",
      title: "Acme Refining | New Refinery Expansion Announced in Texas",
      snippet: "Acme Refining announced a new refinery expansion project, awarded to BuildCo EPC, expected completion 2027.",
      url: "https://acmerefining.example.com/news/action-test",
      domain: "acmerefining.example.com",
      country: "USA",
      sourceProvider: "MOCK",
      retrievedAt: new Date(),
      processedStatus: "UNPROCESSED",
      extractionStatus: "NOT_STARTED",
    });

    const result = await processProjectResultsAction({ batchSize: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectsCreated).toBeGreaterThanOrEqual(1);
    }
  });

  it("updateProjectStatusAction updates status and is ownership-checked", async () => {
    const project = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Status Test Co",
      projectName: "Status Test Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    const result = await updateProjectStatusAction(project.id, "WATCHING");
    expect(result.ok).toBe(true);

    const updated = await ProjectOpportunity.findById(project.id);
    expect(updated?.status).toBe("WATCHING");
  });

  it("recordProjectFeedbackAction: HIGH_POTENTIAL approves, NOT_RELEVANT rejects, WATCHING/CONTACTED are plain status changes", async () => {
    const highPotential = await ProjectOpportunity.create({
      workspaceId,
      clientName: "High Potential Co",
      projectName: "High Potential Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const notRelevant = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Not Relevant Co",
      projectName: "Not Relevant Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });
    const contacted = await ProjectOpportunity.create({
      workspaceId,
      clientName: "Contacted Co",
      projectName: "Contacted Project",
      rawSearchResultId: "raw",
      discoveryRunId: "run",
      sourceHistory: [],
      status: "NEW",
    });

    await recordProjectFeedbackAction(highPotential.id, "HIGH_POTENTIAL");
    await recordProjectFeedbackAction(notRelevant.id, "NOT_RELEVANT");
    await recordProjectFeedbackAction(contacted.id, "CONTACTED");

    expect((await ProjectOpportunity.findById(highPotential.id))?.status).toBe("APPROVED");
    expect((await ProjectOpportunity.findById(notRelevant.id))?.status).toBe("REJECTED");
    expect((await ProjectOpportunity.findById(contacted.id))?.status).toBe("CONTACTED");
  });
});
