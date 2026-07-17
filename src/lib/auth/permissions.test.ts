import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission, ROLES, AccessDeniedError } from "./permissions";
import type { Permission } from "./permissions";

const ALL_PERMISSIONS: Permission[] = [
  "view_dashboard",
  "run_discovery",
  "process_extraction",
  "manage_records",
  "export_data",
  "manage_contacts",
  "manage_billing",
  "manage_workspace",
  "view_admin",
];

describe("permissions", () => {
  it("PLATFORM_ADMIN has every permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission(ROLES.PLATFORM_ADMIN, permission)).toBe(true);
    }
  });

  it("VIEWER can view the dashboard and export data, but not manage records/billing/workspace", () => {
    expect(hasPermission(ROLES.VIEWER, "view_dashboard")).toBe(true);
    expect(hasPermission(ROLES.VIEWER, "export_data")).toBe(true);
    expect(hasPermission(ROLES.VIEWER, "manage_records")).toBe(false);
    expect(hasPermission(ROLES.VIEWER, "manage_contacts")).toBe(false);
    expect(hasPermission(ROLES.VIEWER, "manage_billing")).toBe(false);
    expect(hasPermission(ROLES.VIEWER, "manage_workspace")).toBe(false);
  });

  it("USER can run discovery, process extraction, and manage contacts, but not billing or workspace settings", () => {
    expect(hasPermission(ROLES.USER, "run_discovery")).toBe(true);
    expect(hasPermission(ROLES.USER, "process_extraction")).toBe(true);
    expect(hasPermission(ROLES.USER, "manage_contacts")).toBe(true);
    expect(hasPermission(ROLES.USER, "manage_billing")).toBe(false);
    expect(hasPermission(ROLES.USER, "manage_workspace")).toBe(false);
  });

  it("only OWNER can manage billing", () => {
    expect(hasPermission(ROLES.OWNER, "manage_billing")).toBe(true);
    expect(hasPermission(ROLES.ADMIN, "manage_billing")).toBe(false);
    expect(hasPermission(ROLES.MANAGER, "manage_billing")).toBe(false);
  });

  it("OWNER and ADMIN can manage the workspace, MANAGER/USER/VIEWER cannot", () => {
    expect(hasPermission(ROLES.OWNER, "manage_workspace")).toBe(true);
    expect(hasPermission(ROLES.ADMIN, "manage_workspace")).toBe(true);
    expect(hasPermission(ROLES.MANAGER, "manage_workspace")).toBe(false);
    expect(hasPermission(ROLES.USER, "manage_workspace")).toBe(false);
    expect(hasPermission(ROLES.VIEWER, "manage_workspace")).toBe(false);
  });

  it("no ordinary workspace role has view_admin — it's PlatformAdmin-only", () => {
    for (const role of [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER, ROLES.VIEWER]) {
      expect(hasPermission(role, "view_admin")).toBe(false);
    }
  });

  it("requirePermission throws AccessDeniedError when the role lacks the permission", () => {
    expect(() => requirePermission(ROLES.VIEWER, "manage_billing")).toThrow(AccessDeniedError);
  });

  it("requirePermission does not throw when the role has the permission", () => {
    expect(() => requirePermission(ROLES.OWNER, "manage_billing")).not.toThrow();
  });
});
