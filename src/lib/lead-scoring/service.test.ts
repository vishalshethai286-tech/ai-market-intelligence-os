import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, CompanyProfile, ProductService, TargetCompany } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { buildInitialBrain } = await import("@/lib/business-brain/service");
const { scoreTargetCompany, scoreAllTargetCompanies, TargetCompanyNotFoundError, BrainNotReadyError } =
  await import("./service");

await dbConnect();

const TEST_PREFIX = "vitest-lead-scoring-";

describe("lead-scoring service", () => {
  let userId: string;
  let workspaceId: string;
  let targetId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Lead Scoring" });
    userId = user.id;

    const workspace = await createWorkspaceWithOwner("Lead Scoring Co", userId);
    workspaceId = workspace.id;
    await CompanyProfile.create({
      workspaceId,
      companyName: "Acme Pumps",
      industry: "Manufacturing",
      countriesServed: ["United States"],
      confidenceScore: 0.9,
      sourceUrls: [],
      status: "APPROVED",
    });
    await ProductService.create({
      workspaceId,
      name: "Centrifugal Pump",
      type: "PRODUCT",
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["OEM"],
      sourceUrls: [],
      confidenceScore: 0.9,
      status: "APPROVED",
    });
    await buildInitialBrain(workspaceId);

    const target = await TargetCompany.create({
      workspaceId,
      companyName: "Prospect Inc",
      website: "https://prospect.example",
      industry: "Oil & Gas",
      buyerType: "OEM",
      matchedProduct: "Centrifugal Pump",
      confidenceScore: 0.8,
    });
    targetId = target.id;
  });

  afterAll(async () => {
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("scoreTargetCompany computes and persists a priorityScore/priorityGrade", async () => {
    const { target, breakdown } = await scoreTargetCompany(workspaceId, targetId);
    expect(target.priorityScore).toBe(breakdown.totalScore);
    expect(target.priorityGrade).toBe(breakdown.grade);
    // Fully matching a Manufacturing/Oil & Gas/OEM/Centrifugal Pump brain should score well.
    expect(breakdown.industryMatch).toBe(100);
    expect(breakdown.buyerTypeMatch).toBe(100);
  });

  it("scoreTargetCompany throws TargetCompanyNotFoundError for an id from another workspace", async () => {
    const otherWorkspace = await createWorkspaceWithOwner("Lead Scoring Other Co", userId);
    try {
      await expect(scoreTargetCompany(otherWorkspace.id, targetId)).rejects.toThrow(TargetCompanyNotFoundError);
    } finally {
      await Workspace.deleteOne({ _id: otherWorkspace.id });
    }
  });

  it("scoreAllTargetCompanies scores every target company in the workspace", async () => {
    await TargetCompany.create({ workspaceId, companyName: "Second Prospect Inc", confidenceScore: 0.5 });

    const result = await scoreAllTargetCompanies(workspaceId);
    expect(result.total).toBe(2);
    expect(result.scored).toBe(2);

    const targets = await TargetCompany.find({ workspaceId });
    expect(targets.every((t) => t.priorityGrade !== null)).toBe(true);
  });

  it("scoreAllTargetCompanies throws BrainNotReadyError without a Business Brain", async () => {
    const noBrainWorkspace = await createWorkspaceWithOwner("Lead Scoring No Brain Co", userId);
    try {
      await expect(scoreAllTargetCompanies(noBrainWorkspace.id)).rejects.toThrow(BrainNotReadyError);
    } finally {
      await Workspace.deleteOne({ _id: noBrainWorkspace.id });
    }
  });
});
