import { describe, expect, it } from "vitest";
import { calculateProjectDuplicateScore } from "./scoring";
import type { ProjectDuplicateCandidate } from "./scoring";
import { DUPLICATE_SCORE_THRESHOLDS } from "./constants";

const base: ProjectDuplicateCandidate = {
  clientName: "Acme Industries",
  projectName: "New Refinery Expansion",
  location: "Houston, Texas",
  country: "USA",
  contractorName: "BuildCo EPC",
  timeline: "2027",
  sourceUrl: "https://news.example.com/acme-refinery",
  projectInformationLink: "https://acme.com/projects/refinery-expansion",
};

describe("calculateProjectDuplicateScore", () => {
  it("scores a shared project-information link as a high-confidence auto-merge, even with nothing else matching", () => {
    const other: ProjectDuplicateCandidate = {
      clientName: "Totally Different Client",
      projectName: "Unrelated Project",
      location: "Elsewhere",
      country: "Canada",
      contractorName: "",
      timeline: "",
      sourceUrl: "",
      projectInformationLink: "https://acme.com/projects/refinery-expansion",
    };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("projectInformationLink");
  });

  it("scores a shared source URL as a high-confidence auto-merge", () => {
    const other: ProjectDuplicateCandidate = {
      clientName: "Totally Different Client",
      projectName: "Unrelated Project",
      location: "Elsewhere",
      country: "Canada",
      contractorName: "",
      timeline: "",
      sourceUrl: "https://news.example.com/acme-refinery",
      projectInformationLink: "",
    };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
    expect(result.matchingFields).toContain("sourceUrl");
  });

  it("scores same client + near-exact project name + same location as a possible/likely duplicate (Pending Review), not an auto-merge", () => {
    // Per the Phase 9 spec's own wording, this combination is a "likely
    // duplicate" — strong enough for human review, but only a shared
    // link/source URL is treated as conclusive enough to auto-merge.
    const other: ProjectDuplicateCandidate = {
      clientName: "Acme Industries Inc.",
      projectName: "New Refinery Expansion",
      location: "Houston, Texas",
      country: "USA",
      contractorName: "",
      timeline: "",
      sourceUrl: "",
      projectInformationLink: "",
    };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores same project name + country + contractor (no link/client match) as a possible duplicate, not an auto-merge", () => {
    const other: ProjectDuplicateCandidate = {
      clientName: "",
      projectName: "New Refinery Expansion",
      location: "",
      country: "USA",
      contractorName: "BuildCo EPC",
      timeline: "",
      sourceUrl: "",
      projectInformationLink: "",
    };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.score).toBeGreaterThanOrEqual(DUPLICATE_SCORE_THRESHOLDS.review);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.autoMerge);
  });

  it("scores two unrelated projects low", () => {
    const other: ProjectDuplicateCandidate = {
      clientName: "Zephyr Logistics",
      projectName: "Warehouse Automation Rollout",
      location: "Mumbai, India",
      country: "India",
      contractorName: "AutoBuild Systems",
      timeline: "2029",
      sourceUrl: "https://zephyr.example/warehouse",
      projectInformationLink: "https://zephyr.example/projects/warehouse",
    };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.score).toBeLessThan(DUPLICATE_SCORE_THRESHOLDS.review);
  });

  it("flags conflicting fields when project-information links disagree", () => {
    const other: ProjectDuplicateCandidate = { ...base, projectInformationLink: "https://acme.com/different-project" };
    const result = calculateProjectDuplicateScore(base, other);
    expect(result.conflictingFields).toContain("projectInformationLink");
  });
});
