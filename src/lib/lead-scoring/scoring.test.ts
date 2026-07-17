import { describe, expect, it } from "vitest";
import { computeLeadScore, scoreToGrade, type LeadScoringContext, type ScorableTargetCompany } from "./scoring";

const baseTarget: ScorableTargetCompany = {
  id: "target_1",
  companyName: "Acme Pumps",
  industry: null,
  buyerType: null,
  matchedProduct: null,
  country: null,
  website: null,
  confidenceScore: 0,
};

const emptyContext: LeadScoringContext = {
  products: [],
  targetIndustries: [],
  buyerTypes: [],
  countriesServed: [],
  goodLeadReferences: [],
  feedbackByCompanyKey: new Map(),
};

describe("scoreToGrade", () => {
  it("grades A+ at and above 85", () => {
    expect(scoreToGrade(85)).toBe("A_PLUS");
    expect(scoreToGrade(100)).toBe("A_PLUS");
  });

  it("grades A from 70 to just under 85", () => {
    expect(scoreToGrade(70)).toBe("A");
    expect(scoreToGrade(84.99)).toBe("A");
  });

  it("grades B from 50 to just under 70", () => {
    expect(scoreToGrade(50)).toBe("B");
    expect(scoreToGrade(69.99)).toBe("B");
  });

  it("grades C below 50", () => {
    expect(scoreToGrade(49.99)).toBe("C");
    expect(scoreToGrade(0)).toBe("C");
  });
});

describe("computeLeadScore — field match scoring", () => {
  it("scores 0 on every match factor when all fields are empty", () => {
    const result = computeLeadScore(baseTarget, emptyContext);
    expect(result.productMatch).toBe(0);
    expect(result.industryMatch).toBe(0);
    expect(result.buyerTypeMatch).toBe(0);
    expect(result.countryMatch).toBe(0);
  });

  it("scores 100 on a case-insensitive exact match", () => {
    const target = { ...baseTarget, industry: "manufacturing" };
    const context = { ...emptyContext, targetIndustries: ["Manufacturing"] };
    expect(computeLeadScore(target, context).industryMatch).toBe(100);
  });

  it("scores 40 when the field has a value that matches nothing known", () => {
    const target = { ...baseTarget, industry: "Underwater Basket Weaving" };
    const context = { ...emptyContext, targetIndustries: ["Manufacturing"] };
    expect(computeLeadScore(target, context).industryMatch).toBe(40);
  });
});

describe("computeLeadScore — source quality and contact availability", () => {
  it("scales confidenceScore (0-1) to sourceQuality (0-100)", () => {
    expect(computeLeadScore({ ...baseTarget, confidenceScore: 0.7 }, emptyContext).sourceQuality).toBe(70);
  });

  it("scores 100 contact availability when a website is present", () => {
    expect(computeLeadScore({ ...baseTarget, website: "https://acme.com" }, emptyContext).contactAvailability).toBe(
      100,
    );
  });

  it("scores 0 contact availability when there's no website", () => {
    expect(computeLeadScore(baseTarget, emptyContext).contactAvailability).toBe(0);
  });
});

describe("computeLeadScore — similarity to approved leads", () => {
  it("scores 0 with no approved references", () => {
    expect(computeLeadScore(baseTarget, emptyContext).similarityToGoodLeads).toBe(0);
  });

  it("awards 25 points per matching field against the best-matching reference", () => {
    const target = { ...baseTarget, industry: "Oil & Gas", buyerType: "OEM" };
    const context: LeadScoringContext = {
      ...emptyContext,
      goodLeadReferences: [
        { id: "ref_1", industry: "Oil & Gas", buyerType: "OEM", matchedProduct: null, country: null },
      ],
    };
    expect(computeLeadScore(target, context).similarityToGoodLeads).toBe(50);
  });

  it("excludes the target itself from its own reference pool", () => {
    const target = { ...baseTarget, industry: "Oil & Gas" };
    const context: LeadScoringContext = {
      ...emptyContext,
      goodLeadReferences: [{ id: "target_1", industry: "Oil & Gas", buyerType: null, matchedProduct: null, country: null }],
    };
    expect(computeLeadScore(target, context).similarityToGoodLeads).toBe(0);
  });
});

describe("computeLeadScore — Business Brain feedback", () => {
  it("scores a neutral 50 with no feedback at all", () => {
    expect(computeLeadScore(baseTarget, emptyContext).brainFeedback).toBe(50);
  });

  it("shifts up 25 per net positive feedback event, clamped at 100", () => {
    const context: LeadScoringContext = {
      ...emptyContext,
      feedbackByCompanyKey: new Map([["acme pumps", { good: 3, bad: 0 }]]),
    };
    expect(computeLeadScore(baseTarget, context).brainFeedback).toBe(100);
  });

  it("shifts down 25 per net negative feedback event, clamped at 0", () => {
    const context: LeadScoringContext = {
      ...emptyContext,
      feedbackByCompanyKey: new Map([["acme pumps", { good: 0, bad: 3 }]]),
    };
    expect(computeLeadScore(baseTarget, context).brainFeedback).toBe(0);
  });
});

describe("computeLeadScore — composite total and grade", () => {
  it("gives a perfect target an A+ grade", () => {
    const target: ScorableTargetCompany = {
      id: "target_1",
      companyName: "Acme Pumps",
      industry: "Oil & Gas",
      buyerType: "OEM",
      matchedProduct: "Centrifugal Pump",
      country: "United States",
      website: "https://acme.com",
      confidenceScore: 1,
    };
    const context: LeadScoringContext = {
      products: ["Centrifugal Pump"],
      targetIndustries: ["Oil & Gas"],
      buyerTypes: ["OEM"],
      countriesServed: ["United States"],
      goodLeadReferences: [
        {
          id: "target_2",
          industry: "Oil & Gas",
          buyerType: "OEM",
          matchedProduct: "Centrifugal Pump",
          country: "United States",
        },
      ],
      feedbackByCompanyKey: new Map([["acme pumps", { good: 2, bad: 0 }]]),
    };
    const result = computeLeadScore(target, context);
    expect(result.totalScore).toBe(100);
    expect(result.grade).toBe("A_PLUS");
  });

  it("gives a maximally-empty target a C grade", () => {
    const result = computeLeadScore(baseTarget, emptyContext);
    // Only brainFeedback (neutral 50) contributes: 50 * 0.1 = 5.
    expect(result.totalScore).toBe(5);
    expect(result.grade).toBe("C");
  });
});
