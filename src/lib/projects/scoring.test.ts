import { describe, expect, it } from "vitest";
import { computeProjectScore, scoreToProjectPriority } from "./scoring";
import type { ScorableProjectCandidate, ProjectScoringContext } from "./scoring";

const baseContext: ProjectScoringContext = {
  products: ["Centrifugal Pump"],
  targetIndustries: ["Oil & Gas"],
  countriesServed: ["United States"],
};

const perfectCandidate: ScorableProjectCandidate = {
  industry: "Oil & Gas",
  matchedProductServiceName: "Centrifugal Pump",
  country: "United States",
  contractorName: "BuildCo EPC",
  timeline: "2027",
  clientName: "Acme Refining",
  projectStage: "TENDER",
  confidenceScore: 1,
  hasSnippet: true,
  isMockProvider: false,
};

const emptyCandidate: ScorableProjectCandidate = {
  industry: "",
  matchedProductServiceName: "",
  country: "",
  contractorName: "",
  timeline: "",
  clientName: "",
  projectStage: "UNKNOWN",
  confidenceScore: 0,
  hasSnippet: false,
  isMockProvider: true,
};

describe("scoreToProjectPriority", () => {
  it("maps thresholds to A+/A/B/C exactly as specified", () => {
    expect(scoreToProjectPriority(85)).toBe("A_PLUS");
    expect(scoreToProjectPriority(100)).toBe("A_PLUS");
    expect(scoreToProjectPriority(84.99)).toBe("A");
    expect(scoreToProjectPriority(70)).toBe("A");
    expect(scoreToProjectPriority(69.99)).toBe("B");
    expect(scoreToProjectPriority(50)).toBe("B");
    expect(scoreToProjectPriority(49.99)).toBe("C");
    expect(scoreToProjectPriority(0)).toBe("C");
  });
});

describe("computeProjectScore", () => {
  it("scores a perfect-match, tender-stage candidate as A+ priority", () => {
    const breakdown = computeProjectScore(perfectCandidate, baseContext);
    expect(breakdown.productMatch).toBe(100);
    expect(breakdown.industryMatch).toBe(100);
    expect(breakdown.countryMatch).toBe(100);
    expect(breakdown.projectStage).toBe(100);
    expect(breakdown.timelineClarity).toBe(100);
    expect(breakdown.contractorVisibility).toBe(100);
    expect(breakdown.clientClarity).toBe(100);
    expect(breakdown.sourceQuality).toBe(100);
    expect(breakdown.tenderLikelihood).toBe(100);
    expect(breakdown.confidenceScore).toBe(100);
    expect(breakdown.priority).toBe("A_PLUS");
  });

  it("scores a fully-empty, unknown-stage candidate as C priority", () => {
    const breakdown = computeProjectScore(emptyCandidate, baseContext);
    expect(breakdown.productMatch).toBe(0);
    expect(breakdown.industryMatch).toBe(0);
    expect(breakdown.countryMatch).toBe(0);
    expect(breakdown.timelineClarity).toBe(0);
    expect(breakdown.contractorVisibility).toBe(0);
    expect(breakdown.clientClarity).toBe(0);
    expect(breakdown.sourceQuality).toBe(0);
    expect(breakdown.confidenceScore).toBe(0);
    expect(breakdown.priority).toBe("C");
  });

  it("scores TENDER/AWARDED/FEED stages higher than OPERATIONAL", () => {
    const tender = computeProjectScore({ ...emptyCandidate, projectStage: "TENDER" }, baseContext);
    const awarded = computeProjectScore({ ...emptyCandidate, projectStage: "AWARDED" }, baseContext);
    const feed = computeProjectScore({ ...emptyCandidate, projectStage: "FEED" }, baseContext);
    const operational = computeProjectScore({ ...emptyCandidate, projectStage: "OPERATIONAL" }, baseContext);

    expect(tender.projectStage).toBeGreaterThan(operational.projectStage);
    expect(awarded.projectStage).toBeGreaterThan(operational.projectStage);
    expect(feed.projectStage).toBeGreaterThan(operational.projectStage);
    expect(tender.tenderLikelihood).toBeGreaterThan(operational.tenderLikelihood);
  });

  it("gives partial credit (40) for a real but unrecognized field value", () => {
    const breakdown = computeProjectScore({ ...emptyCandidate, industry: "Something Else" }, baseContext);
    expect(breakdown.industryMatch).toBe(40);
  });

  it("rewards a real (non-mock) provider over a mock one, all else equal", () => {
    const real = computeProjectScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: false }, baseContext);
    const mock = computeProjectScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: true }, baseContext);
    expect(real.sourceQuality).toBeGreaterThan(mock.sourceQuality);
  });
});
