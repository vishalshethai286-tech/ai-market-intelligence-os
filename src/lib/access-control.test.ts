import { describe, expect, it } from "vitest";
import {
  ROLES,
  isOwner,
  isPlatformAdmin,
  canManageWorkspace,
  canInviteMembers,
  canManageBilling,
  canEditCompanyProfile,
  canEditProductCatalog,
  canReviewBrainFacts,
  canRemoveMember,
  requireRole,
  AccessDeniedError,
} from "./access-control";

describe("isOwner", () => {
  it("is true only for OWNER", () => {
    expect(isOwner(ROLES.OWNER)).toBe(true);
    expect(isOwner(ROLES.ADMIN)).toBe(false);
    expect(isOwner(ROLES.PLATFORM_ADMIN)).toBe(false);
  });
});

describe("isPlatformAdmin", () => {
  it("is true only for PLATFORM_ADMIN", () => {
    expect(isPlatformAdmin(ROLES.PLATFORM_ADMIN)).toBe(true);
    expect(isPlatformAdmin(ROLES.OWNER)).toBe(false);
  });
});

describe("canManageWorkspace", () => {
  it("allows OWNER and ADMIN", () => {
    expect(canManageWorkspace(ROLES.OWNER)).toBe(true);
    expect(canManageWorkspace(ROLES.ADMIN)).toBe(true);
  });

  it("denies MANAGER, USER, VIEWER", () => {
    expect(canManageWorkspace(ROLES.MANAGER)).toBe(false);
    expect(canManageWorkspace(ROLES.USER)).toBe(false);
    expect(canManageWorkspace(ROLES.VIEWER)).toBe(false);
  });

  it("PLATFORM_ADMIN bypasses the check", () => {
    expect(canManageWorkspace(ROLES.PLATFORM_ADMIN)).toBe(true);
  });
});

describe("canInviteMembers", () => {
  it("allows OWNER and ADMIN only, plus PLATFORM_ADMIN", () => {
    expect(canInviteMembers(ROLES.OWNER)).toBe(true);
    expect(canInviteMembers(ROLES.ADMIN)).toBe(true);
    expect(canInviteMembers(ROLES.MANAGER)).toBe(false);
    expect(canInviteMembers(ROLES.PLATFORM_ADMIN)).toBe(true);
  });
});

describe("canManageBilling", () => {
  it("allows only OWNER, plus PLATFORM_ADMIN", () => {
    expect(canManageBilling(ROLES.OWNER)).toBe(true);
    expect(canManageBilling(ROLES.ADMIN)).toBe(false);
    expect(canManageBilling(ROLES.PLATFORM_ADMIN)).toBe(true);
  });
});

describe("content editing (company profile / product catalog / brain facts)", () => {
  const editors = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];
  const readOnly = [ROLES.VIEWER];

  it.each(editors)("%s can edit company profile, product catalog, and brain facts", (role) => {
    expect(canEditCompanyProfile(role)).toBe(true);
    expect(canEditProductCatalog(role)).toBe(true);
    expect(canReviewBrainFacts(role)).toBe(true);
  });

  it.each(readOnly)("%s cannot edit company profile, product catalog, or brain facts", (role) => {
    expect(canEditCompanyProfile(role)).toBe(false);
    expect(canEditProductCatalog(role)).toBe(false);
    expect(canReviewBrainFacts(role)).toBe(false);
  });

  it("PLATFORM_ADMIN can edit all three", () => {
    expect(canEditCompanyProfile(ROLES.PLATFORM_ADMIN)).toBe(true);
    expect(canEditProductCatalog(ROLES.PLATFORM_ADMIN)).toBe(true);
    expect(canReviewBrainFacts(ROLES.PLATFORM_ADMIN)).toBe(true);
  });
});

describe("canRemoveMember", () => {
  it("a non-manager can never remove anyone", () => {
    expect(canRemoveMember(ROLES.USER, ROLES.VIEWER)).toBe(false);
    expect(canRemoveMember(ROLES.VIEWER, ROLES.USER)).toBe(false);
  });

  it("ADMIN can remove non-owner members but not an OWNER", () => {
    expect(canRemoveMember(ROLES.ADMIN, ROLES.USER)).toBe(true);
    expect(canRemoveMember(ROLES.ADMIN, ROLES.OWNER)).toBe(false);
  });

  it("only an OWNER can remove another OWNER", () => {
    expect(canRemoveMember(ROLES.OWNER, ROLES.OWNER)).toBe(true);
  });

  it("PLATFORM_ADMIN can remove anyone, including an OWNER", () => {
    expect(canRemoveMember(ROLES.PLATFORM_ADMIN, ROLES.OWNER)).toBe(true);
    expect(canRemoveMember(ROLES.PLATFORM_ADMIN, ROLES.USER)).toBe(true);
  });
});

describe("requireRole", () => {
  it("does not throw when role is allowed", () => {
    expect(() => requireRole(ROLES.ADMIN, [ROLES.OWNER, ROLES.ADMIN])).not.toThrow();
  });

  it("throws AccessDeniedError when role is not allowed", () => {
    expect(() => requireRole(ROLES.VIEWER, [ROLES.OWNER, ROLES.ADMIN])).toThrow(AccessDeniedError);
  });
});
