import { afterAll, describe, expect, it, vi } from "vitest";
import {
  analyzeContactCompleteness,
  calculateEnrichmentScore,
  getMissingFields,
  determineEnrichmentStatus,
  determineRecommendedAction,
  determineBestContactFor,
  refreshContactEnrichment,
} from "./enrichment";
import type { EnrichableContact } from "./enrichment";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, Contact } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
await dbConnect();

function baseContact(overrides: Partial<EnrichableContact> = {}): EnrichableContact {
  return {
    designation: null,
    roleCategory: "OTHER",
    seniority: "UNKNOWN",
    email: null,
    phoneNumber: null,
    mobileNumber: null,
    linkedinUrl: null,
    companyName: null,
    companyDomain: null,
    sourceUrl: null,
    confidenceScore: 0,
    lastVerifiedAt: null,
    nextFollowUpAt: null,
    status: "NEW",
    doNotContact: false,
    relatedTargetCustomerId: null,
    relatedProjectOpportunityId: null,
    relatedTenderBuyerId: null,
    relatedTenderOpportunityId: null,
    relatedVendorRegistrationId: null,
    ...overrides,
  };
}

function completeContact(): EnrichableContact {
  return baseContact({
    designation: "Procurement Manager",
    roleCategory: "PROCUREMENT",
    seniority: "MANAGER",
    email: "jane@example.com",
    phoneNumber: "+1 555 123 4567",
    linkedinUrl: "linkedin.com/in/jane",
    companyName: "Acme Pumps",
    companyDomain: "acmepumps.com",
    sourceUrl: "https://acmepumps.com/team",
    confidenceScore: 0.9,
    lastVerifiedAt: new Date(),
    status: "CONTACTED",
    relatedTargetCustomerId: "customer-1",
  });
}

describe("analyzeContactCompleteness / getMissingFields", () => {
  it("detects a missing email", () => {
    const contact = completeContact();
    contact.email = null;
    expect(analyzeContactCompleteness(contact).hasEmail).toBe(false);
    expect(getMissingFields(contact)).toContain("Email");
  });

  it("detects a missing phone (both phoneNumber and mobileNumber empty)", () => {
    const contact = completeContact();
    contact.phoneNumber = null;
    contact.mobileNumber = null;
    expect(analyzeContactCompleteness(contact).hasPhone).toBe(false);
    expect(getMissingFields(contact)).toContain("Phone");
  });

  it("treats a mobileNumber-only contact as having a phone", () => {
    const contact = completeContact();
    contact.phoneNumber = null;
    contact.mobileNumber = "+1 555 000 1111";
    expect(analyzeContactCompleteness(contact).hasPhone).toBe(true);
  });

  it("detects low confidence", () => {
    const contact = completeContact();
    contact.confidenceScore = 0.2;
    expect(analyzeContactCompleteness(contact).hasHighConfidence).toBe(false);
    expect(getMissingFields(contact)).toContain("Confidence");
  });

  it("detects a fully complete contact with no missing fields", () => {
    const contact = completeContact();
    expect(getMissingFields(contact)).toEqual([]);
    expect(calculateEnrichmentScore(contact)).toBe(100);
  });

  it("scores 0 for a totally empty contact and is not 100 for a partial one", () => {
    expect(calculateEnrichmentScore(baseContact())).toBeGreaterThanOrEqual(0);
    expect(calculateEnrichmentScore(baseContact())).toBeLessThan(50);
  });
});

describe("determineEnrichmentStatus", () => {
  it("returns COMPLETE for a fully complete, active contact", () => {
    expect(determineEnrichmentStatus(completeContact())).toBe("COMPLETE");
  });

  it("returns DO_NOT_CONTACT when doNotContact is set, overriding every other signal", () => {
    const contact = completeContact();
    contact.doNotContact = true;
    expect(determineEnrichmentStatus(contact)).toBe("DO_NOT_CONTACT");
  });

  it("returns ARCHIVED for an archived contact", () => {
    const contact = completeContact();
    contact.status = "ARCHIVED";
    expect(determineEnrichmentStatus(contact)).toBe("ARCHIVED");
  });

  it("returns NEEDS_EMAIL before other gaps when email is missing", () => {
    const contact = completeContact();
    contact.email = null;
    contact.phoneNumber = null;
    contact.mobileNumber = null;
    expect(determineEnrichmentStatus(contact)).toBe("NEEDS_EMAIL");
  });
});

describe("determineRecommendedAction", () => {
  it("selects DO_NOT_CONTACT when marked do-not-contact", () => {
    const contact = completeContact();
    contact.doNotContact = true;
    expect(determineRecommendedAction(contact).action).toBe("DO_NOT_CONTACT");
  });

  it("selects FIND_EMAIL when there's no email and no phone", () => {
    const contact = baseContact();
    expect(determineRecommendedAction(contact).action).toBe("FIND_EMAIL");
  });

  it("selects FOLLOW_UP when a follow-up is due or overdue, ahead of other gaps", () => {
    const contact = completeContact();
    contact.nextFollowUpAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(determineRecommendedAction(contact).action).toBe("FOLLOW_UP");
  });

  it("selects EMAIL_DRAFT for a fully-enriched NEW contact ready for first outreach", () => {
    const contact = completeContact();
    contact.status = "NEW";
    expect(determineRecommendedAction(contact).action).toBe("EMAIL_DRAFT");
  });
});

describe("determineBestContactFor", () => {
  it("prefers the specific linked opportunity type over a role-based fallback", () => {
    const contact = baseContact({ relatedProjectOpportunityId: "project-1", roleCategory: "PROCUREMENT" });
    expect(determineBestContactFor(contact)).toBe("PROJECT_OPPORTUNITY");
  });

  it("falls back to a role-based label when unlinked", () => {
    expect(determineBestContactFor(baseContact({ roleCategory: "PROCUREMENT" }))).toBe("PROCUREMENT_CONTACT");
    expect(determineBestContactFor(baseContact({ roleCategory: "ENGINEERING" }))).toBe("TECHNICAL_CONTACT");
    expect(determineBestContactFor(baseContact({ roleCategory: "MANAGEMENT" }))).toBe("MANAGEMENT_CONTACT");
    expect(determineBestContactFor(baseContact({ roleCategory: "OTHER" }))).toBe("GENERAL_CONTACT");
  });
});

describe("refreshContactEnrichment", () => {
  const TEST_PREFIX = "vitest-contact-enrichment-refresh-";
  let userId: string;
  let workspaceId: string;

  afterAll(async () => {
    await Contact.deleteMany({ workspaceId });
    await Workspace.deleteOne({ _id: workspaceId });
    await User.deleteOne({ _id: userId });
  });

  it("preserves doNotContact/doNotContactReason while refreshing every enrichment field", async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Enrichment Refresh Test" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Enrichment Refresh Co", userId);
    workspaceId = workspace.id;

    const contact = await Contact.create({
      workspaceId,
      fullName: "Refresh Test Contact",
      sourceHistory: [],
      doNotContact: true,
      doNotContactReason: "Asked not to be contacted",
      enrichmentScore: 0,
      enrichmentStatus: "NEEDS_VERIFICATION",
    });

    const refreshed = await refreshContactEnrichment(workspaceId, contact.id);

    expect(refreshed.doNotContact).toBe(true);
    expect(refreshed.doNotContactReason).toBe("Asked not to be contacted");
    expect(refreshed.enrichmentStatus).toBe("DO_NOT_CONTACT");
    expect(refreshed.recommendedAction).toBe("DO_NOT_CONTACT");
  });
});
