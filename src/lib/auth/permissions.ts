import "server-only";
import {
  ROLES,
  isPlatformAdmin,
  canManageWorkspace,
  canManageBilling,
  canManageDiscovery,
  AccessDeniedError,
} from "@/lib/access-control";
import type { RoleKey } from "@/lib/access-control";

export { ROLES, type RoleKey, AccessDeniedError, isPlatformAdmin };

/**
 * The 9 named permissions from the Phase 12 spec. This module is a
 * spec-shaped facade over access-control.ts's existing per-action role
 * checks, not a second RBAC system — every permission below maps onto a
 * check that was already enforced (and already tested) before this phase.
 * New code should prefer requirePermission()/hasPermission() by name;
 * existing call sites using the underlying access-control.ts functions
 * directly are left as-is (identical behavior, no need to churn tested code).
 */
export type Permission =
  | "view_dashboard"
  | "run_discovery"
  | "process_extraction"
  | "manage_records"
  | "export_data"
  | "manage_contacts"
  | "manage_billing"
  | "manage_workspace"
  | "view_admin";

const ANY_MEMBER_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER, ROLES.VIEWER];

function hasAnyMemberRole(role: string): boolean {
  return isPlatformAdmin(role) || ANY_MEMBER_ROLES.includes(role);
}

const PERMISSION_CHECKS: Record<Permission, (role: string) => boolean> = {
  // Every workspace member (including Viewer) can see the dashboard.
  view_dashboard: hasAnyMemberRole,
  run_discovery: canManageDiscovery,
  process_extraction: canManageDiscovery,
  manage_records: canManageDiscovery,
  // Exports are a read action, gated the same as viewing the underlying data — every member can export what they can already see.
  export_data: hasAnyMemberRole,
  manage_contacts: canManageDiscovery,
  manage_billing: canManageBilling,
  manage_workspace: canManageWorkspace,
  // Platform-admin-only — distinct from the per-workspace PLATFORM_ADMIN role check used elsewhere (that one gates the /platform-admin section by session email, not workspace role).
  view_admin: isPlatformAdmin,
};

export function hasPermission(role: string, permission: Permission): boolean {
  return PERMISSION_CHECKS[permission](role);
}

/** Throws AccessDeniedError if `role` lacks `permission` — call in server actions/route handlers before the action it protects. */
export function requirePermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AccessDeniedError();
  }
}
