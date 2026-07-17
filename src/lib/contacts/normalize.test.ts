import { describe, expect, it } from "vitest";
import {
  normalizeContactName,
  splitFullName,
  normalizeEmail,
  normalizePhone,
  normalizeLinkedInUrl,
  normalizeCompanyDomain,
  normalizeDesignation,
  inferRoleCategoryFromDesignation,
  inferSeniorityFromDesignation,
  buildContactDuplicateKey,
} from "./normalize";

describe("splitFullName", () => {
  it("splits the first token as firstName and the rest as lastName", () => {
    expect(splitFullName("Jane Doe")).toEqual({ firstName: "Jane", lastName: "Doe" });
    expect(splitFullName("John A. Smith")).toEqual({ firstName: "John", lastName: "A. Smith" });
  });

  it("handles a single-token name with an empty lastName", () => {
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });

  it("handles empty input", () => {
    expect(splitFullName("")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  John.Doe@Example.COM  ")).toBe("john.doe@example.com");
  });
});

describe("normalizePhone", () => {
  it("keeps digits and a leading plus", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });
});

describe("normalizeLinkedInUrl", () => {
  it("strips scheme, www, query string, and trailing slash", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe/?ref=x")).toBe("linkedin.com/in/jane-doe");
  });

  it("returns empty string for a non-LinkedIn URL", () => {
    expect(normalizeLinkedInUrl("https://example.com/in/jane-doe")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeLinkedInUrl("")).toBe("");
  });
});

describe("normalizeCompanyDomain", () => {
  it("strips scheme, www, and path", () => {
    expect(normalizeCompanyDomain("https://www.acme.com/about")).toBe("acme.com");
  });
});

describe("normalizeContactName / normalizeDesignation", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeContactName("  Jane   O'Doe!! ")).toBe("jane o doe");
    expect(normalizeDesignation("Procurement Manager,")).toBe("procurement manager");
  });
});

describe("inferRoleCategoryFromDesignation / inferSeniorityFromDesignation", () => {
  const cases: [string, string, string][] = [
    ["procurement manager", "PROCUREMENT", "MANAGER"],
    ["head of sourcing", "SOURCING", "HEAD"],
    ["supply chain director", "SUPPLY_CHAIN", "DIRECTOR"],
    ["project manager", "PROJECT_MANAGEMENT", "MANAGER"],
    ["plant head", "PLANT_OPERATIONS", "HEAD"],
    ["vendor registration officer", "VENDOR_MANAGEMENT", "OFFICER"],
    ["contracts manager", "CONTRACTS", "MANAGER"],
    ["tender executive", "TENDERING", "EXECUTIVE"],
  ];

  for (const [designation, expectedRole, expectedSeniority] of cases) {
    it(`"${designation}" -> role ${expectedRole}, seniority ${expectedSeniority}`, () => {
      expect(inferRoleCategoryFromDesignation(designation)).toBe(expectedRole);
      expect(inferSeniorityFromDesignation(designation)).toBe(expectedSeniority);
    });
  }

  it("falls back to OTHER/UNKNOWN for an empty or unrecognized designation", () => {
    expect(inferRoleCategoryFromDesignation("")).toBe("OTHER");
    expect(inferSeniorityFromDesignation("")).toBe("UNKNOWN");
    expect(inferRoleCategoryFromDesignation("Xyz Blorp")).toBe("OTHER");
    expect(inferSeniorityFromDesignation("Xyz Blorp")).toBe("UNKNOWN");
  });
});

describe("buildContactDuplicateKey", () => {
  it("keys on email first", () => {
    const key = buildContactDuplicateKey("ws1", "Jane Doe", "Jane.Doe@Example.com", "https://linkedin.com/in/jane-doe", "acme.com");
    expect(key).toBe("ws1:email:jane.doe@example.com");
  });

  it("falls back to LinkedIn URL when there's no email", () => {
    const key = buildContactDuplicateKey("ws1", "Jane Doe", "", "https://www.linkedin.com/in/jane-doe/", "acme.com");
    expect(key).toBe("ws1:linkedin:linkedin.com/in/jane-doe");
  });

  it("falls back to name+companyDomain when there's no email or LinkedIn", () => {
    const key = buildContactDuplicateKey("ws1", "Jane Doe", "", "", "acme.com");
    expect(key).toBe("ws1:name-domain:jane doe:acme.com");
  });

  it("falls back to name alone when nothing else is available", () => {
    const key = buildContactDuplicateKey("ws1", "Jane Doe", "", "", "");
    expect(key).toBe("ws1:name:jane doe");
  });

  it("scopes keys to the workspace so two workspaces never collide", () => {
    const keyA = buildContactDuplicateKey("ws1", "Jane Doe", "jane@acme.com", "", "");
    const keyB = buildContactDuplicateKey("ws2", "Jane Doe", "jane@acme.com", "", "");
    expect(keyA).not.toBe(keyB);
  });
});
