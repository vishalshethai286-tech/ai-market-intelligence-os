import { describe, expect, it } from "vitest";
import { computeCustomerScore, scoreToCustomerPriority } from "./scoring";
import type { ScorableCustomerCandidate, CustomerScoringContext } from "./scoring";

const baseContext: CustomerScoringContext = {
  products: ["Centrifugal Pump"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["OEM"],
  countriesServed: ["United States"],
  approvedReferences: [],
};

const perfectCandidate: ScorableCustomerCandidate = {
  matchedIndustry: "Oil & Gas",
  buyerType: "OEM",
  matchedProductServiceName: "Centrifugal Pump",
  country: "United States",
  website: "https://acme.com",
  address: "123 Main St",
  phoneNumber: "+1 555 123 4567",
  confidenceScore: 1,
  hasSnippet: true,
  isMockProvider: false,
};

const emptyCandidate: ScorableCustomerCandidate = {
  matchedIndustry: "",
  buyerType: "",
  matchedProductServiceName: "",
  country: "",
  website: "",
  address: "",
  phoneNumber: "",
  confidenceScore: 0,
  hasSnippet: false,
  isMockProvider: true,
};

describe("scoreToCustomerPriority", () => {
  it("maps thresholds to A+/A/B/C exactly as specified", () => {
    expect(scoreToCustomerPriority(85)).toBe("A_PLUS");
    expect(scoreToCustomerPriority(100)).toBe("A_PLUS");
    expect(scoreToCustomerPriority(84.99)).toBe("A");
    expect(scoreToCustomerPriority(70)).toBe("A");
    expect(scoreToCustomerPriority(69.99)).toBe("B");
    expect(scoreToCustomerPriority(50)).toBe("B");
    expect(scoreToCustomerPriority(49.99)).toBe("C");
    expect(scoreToCustomerPriority(0)).toBe("C");
  });
});

describe("computeCustomerScore", () => {
  it("scores a perfect-match candidate as A+ priority", () => {
    const breakdown = computeCustomerScore(perfectCandidate, baseContext);
    expect(breakdown.productMatch).toBe(100);
    expect(breakdown.industryMatch).toBe(100);
    expect(breakdown.buyerTypeMatch).toBe(100);
    expect(breakdown.countryMatch).toBe(100);
    expect(breakdown.websiteAvailability).toBe(100);
    expect(breakdown.addressPhoneAvailability).toBe(100);
    expect(breakdown.sourceQuality).toBe(100);
    expect(breakdown.confidenceScore).toBe(100);
    expect(breakdown.priority).toBe("A_PLUS");
  });

  it("scores a fully-empty candidate as C priority with zeroed factors", () => {
    const breakdown = computeCustomerScore(emptyCandidate, baseContext);
    expect(breakdown.productMatch).toBe(0);
    expect(breakdown.industryMatch).toBe(0);
    expect(breakdown.buyerTypeMatch).toBe(0);
    expect(breakdown.countryMatch).toBe(0);
    expect(breakdown.websiteAvailability).toBe(0);
    expect(breakdown.addressPhoneAvailability).toBe(0);
    expect(breakdown.sourceQuality).toBe(0);
    expect(breakdown.confidenceScore).toBe(0);
    expect(breakdown.priority).toBe("C");
  });

  it("gives partial credit (40) for a real but unrecognized field value", () => {
    const breakdown = computeCustomerScore({ ...emptyCandidate, matchedIndustry: "Something Else" }, baseContext);
    expect(breakdown.industryMatch).toBe(40);
  });

  it("scores address/phone availability independently — half credit for just one", () => {
    const addressOnly = computeCustomerScore({ ...emptyCandidate, address: "123 Main St" }, baseContext);
    expect(addressOnly.addressPhoneAvailability).toBe(50);
  });

  it("gives similarity credit for matching an approved reference, 0 with no references", () => {
    const context: CustomerScoringContext = {
      ...baseContext,
      approvedReferences: [{ id: "ref1", matchedIndustry: "Oil & Gas", buyerType: "OEM", matchedProductServiceName: "Centrifugal Pump", country: "United States" }],
    };
    const withRefs = computeCustomerScore(perfectCandidate, context);
    const withoutRefs = computeCustomerScore(perfectCandidate, baseContext);
    expect(withRefs.similarityToApprovedBuyerTypes).toBe(100);
    expect(withoutRefs.similarityToApprovedBuyerTypes).toBe(0);
  });

  it("rewards a real (non-mock) provider over a mock one, all else equal", () => {
    const real = computeCustomerScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: false }, baseContext);
    const mock = computeCustomerScore({ ...emptyCandidate, hasSnippet: true, isMockProvider: true }, baseContext);
    expect(real.sourceQuality).toBeGreaterThan(mock.sourceQuality);
  });
});
