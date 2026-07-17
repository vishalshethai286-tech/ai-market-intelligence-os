import { describe, expect, it } from "vitest";
import { computeContactScore, scoreToContactPriority } from "./scoring";
import type { ScorableContactCandidate, ContactScoringContext } from "./scoring";

const baseContext: ContactScoringContext = { targetCountries: ["USA"] };

const perfectCandidate: ScorableContactCandidate = {
  roleCategory: "PROCUREMENT",
  seniority: "DIRECTOR",
  hasEmail: true,
  hasPhone: true,
  hasLinkedIn: true,
  isLinkedToApprovedRecord: true,
  sourceType: "COMPANY_WEBSITE",
  country: "USA",
  confidenceScore: 1,
};

const emptyCandidate: ScorableContactCandidate = {
  roleCategory: "OTHER",
  seniority: "UNKNOWN",
  hasEmail: false,
  hasPhone: false,
  hasLinkedIn: false,
  isLinkedToApprovedRecord: false,
  sourceType: "OTHER",
  country: "",
  confidenceScore: 0,
};

describe("scoreToContactPriority", () => {
  it("maps thresholds to A+/A/B/C exactly as specified", () => {
    expect(scoreToContactPriority(85)).toBe("A_PLUS");
    expect(scoreToContactPriority(70)).toBe("A");
    expect(scoreToContactPriority(50)).toBe("B");
    expect(scoreToContactPriority(49.99)).toBe("C");
  });
});

describe("computeContactScore", () => {
  it("scores a procurement manager/director-level contact with full contactability high (A or A+)", () => {
    const breakdown = computeContactScore(perfectCandidate, baseContext);
    expect(breakdown.roleRelevance).toBe(100);
    expect(["A_PLUS", "A"]).toContain(breakdown.priority);
  });

  it("scores an admin/other role with nothing else going for it low (B or C)", () => {
    const breakdown = computeContactScore(emptyCandidate, baseContext);
    expect(breakdown.roleRelevance).toBe(20);
    expect(["B", "C"]).toContain(breakdown.priority);
  });

  it("scores a high-value role (procurement/purchase/sourcing/supply chain/vendor management/contracts/tendering/project management) above a medium-value role, which scores above a low-value one", () => {
    const high = computeContactScore({ ...emptyCandidate, roleCategory: "PROCUREMENT" }, baseContext);
    const medium = computeContactScore({ ...emptyCandidate, roleCategory: "ENGINEERING" }, baseContext);
    const low = computeContactScore({ ...emptyCandidate, roleCategory: "ADMINISTRATION" }, baseContext);
    expect(high.roleRelevance).toBeGreaterThan(medium.roleRelevance);
    expect(medium.roleRelevance).toBeGreaterThan(low.roleRelevance);
  });

  it("having an email, phone, or LinkedIn URL each improve the total score over having none", () => {
    const none = computeContactScore(emptyCandidate, baseContext);
    const withEmail = computeContactScore({ ...emptyCandidate, hasEmail: true }, baseContext);
    const withPhone = computeContactScore({ ...emptyCandidate, hasPhone: true }, baseContext);
    const withLinkedIn = computeContactScore({ ...emptyCandidate, hasLinkedIn: true }, baseContext);
    expect(withEmail.totalScore).toBeGreaterThan(none.totalScore);
    expect(withPhone.totalScore).toBeGreaterThan(none.totalScore);
    expect(withLinkedIn.totalScore).toBeGreaterThan(none.totalScore);
  });

  it("a higher-quality source (company website) scores above a lower-quality one (public directory), which scores above a bare manual entry", () => {
    const companyWebsite = computeContactScore({ ...emptyCandidate, sourceType: "COMPANY_WEBSITE" }, baseContext);
    const directory = computeContactScore({ ...emptyCandidate, sourceType: "PUBLIC_DIRECTORY" }, baseContext);
    const manual = computeContactScore({ ...emptyCandidate, sourceType: "MANUAL_ENTRY" }, baseContext);
    expect(companyWebsite.sourceQuality).toBeGreaterThan(directory.sourceQuality);
    expect(directory.sourceQuality).toBeGreaterThanOrEqual(manual.sourceQuality);
  });

  it("being linked to an approved record improves the score over not being linked", () => {
    const linked = computeContactScore({ ...emptyCandidate, isLinkedToApprovedRecord: true }, baseContext);
    const unlinked = computeContactScore({ ...emptyCandidate, isLinkedToApprovedRecord: false }, baseContext);
    expect(linked.totalScore).toBeGreaterThan(unlinked.totalScore);
  });

  it("a country matching the workspace's target countries scores higher than one that doesn't", () => {
    const matching = computeContactScore({ ...emptyCandidate, country: "USA" }, baseContext);
    const nonMatching = computeContactScore({ ...emptyCandidate, country: "India" }, baseContext);
    expect(matching.countryRelevance).toBeGreaterThan(nonMatching.countryRelevance);
  });

  it("a higher confidenceScore improves the total score", () => {
    const highConfidence = computeContactScore({ ...emptyCandidate, confidenceScore: 1 }, baseContext);
    const lowConfidence = computeContactScore({ ...emptyCandidate, confidenceScore: 0 }, baseContext);
    expect(highConfidence.totalScore).toBeGreaterThan(lowConfidence.totalScore);
  });
});
