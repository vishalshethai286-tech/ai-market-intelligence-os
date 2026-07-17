import { describe, expect, it } from "vitest";
import { CustomerCandidateSchema } from "./schema";

describe("CustomerCandidateSchema", () => {
  it("accepts a well-formed candidate", () => {
    const valid = {
      isRealCompany: true,
      isTargetCustomer: true,
      customerName: "ABC Pumps",
      country: "USA",
      website: "https://abcpumps.com",
      address: "",
      phoneNumber: "",
      matchedProductServiceName: "Centrifugal Pump",
      matchedIndustry: "Manufacturing",
      buyerType: "Manufacturer",
      aiRelevanceExplanation: "Plausible target.",
      confidenceScore: 0.8,
    };
    expect(CustomerCandidateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects malformed AI output (wrong types, missing fields, out-of-range confidence)", () => {
    expect(CustomerCandidateSchema.safeParse({}).success).toBe(false);
    expect(
      CustomerCandidateSchema.safeParse({
        isRealCompany: "yes",
        isTargetCustomer: true,
        customerName: "ABC Pumps",
        country: "USA",
        website: "",
        address: "",
        phoneNumber: "",
        matchedProductServiceName: "",
        matchedIndustry: "",
        buyerType: "",
        aiRelevanceExplanation: "",
        confidenceScore: 1.5,
      }).success,
    ).toBe(false);
  });
});
