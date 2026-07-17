/**
 * Workspace role catalog. Kept in sync with the `Role` rows seeded by
 * `prisma/seed.ts` — this module is where role *keys* are enforced against
 * actions; the DB `Role` table (name/description/permissions JSON) is the
 * user-facing catalog, not the source of truth for what a role can do.
 */
export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  USER: "USER",
  VIEWER: "VIEWER",
  /** Internal platform-team override, not a normal tenant role — see {@link isPlatformAdmin}. */
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export class AccessDeniedError extends Error {
  constructor(message = "You don't have access to perform this action.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

const WORKSPACE_MANAGER_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN];
const MEMBER_INVITER_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN];
const BILLING_MANAGER_ROLES: readonly string[] = [ROLES.OWNER];
const COMPANY_PROFILE_EDITOR_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];
const PRODUCT_CATALOG_EDITOR_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];
const BRAIN_FACT_REVIEWER_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];
const DISCOVERY_MANAGER_ROLES: readonly string[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER];

/** True for the internal platform-team role, which bypasses every per-workspace permission check below. */
export function isPlatformAdmin(role: string): boolean {
  return role === ROLES.PLATFORM_ADMIN;
}

function hasRole(role: string, allowed: readonly string[]): boolean {
  return isPlatformAdmin(role) || allowed.includes(role);
}

export function isOwner(role: string): boolean {
  return role === ROLES.OWNER;
}

/** Rename the workspace, change settings, remove non-owner members. */
export function canManageWorkspace(role: string): boolean {
  return hasRole(role, WORKSPACE_MANAGER_ROLES);
}

/** Invite new members. */
export function canInviteMembers(role: string): boolean {
  return hasRole(role, MEMBER_INVITER_ROLES);
}

/** View/change plan and payment details. */
export function canManageBilling(role: string): boolean {
  return hasRole(role, BILLING_MANAGER_ROLES);
}

/** Edit, regenerate, or approve the AI-generated company profile. Viewers are read-only. */
export function canEditCompanyProfile(role: string): boolean {
  return hasRole(role, COMPANY_PROFILE_EDITOR_ROLES);
}

/** Edit, regenerate, approve/reject, or delete AI-discovered product/service records. Viewers are read-only. */
export function canEditProductCatalog(role: string): boolean {
  return hasRole(role, PRODUCT_CATALOG_EDITOR_ROLES);
}

/** Mark AI Business Brain facts as correct/incorrect/needs review. Viewers are read-only. */
export function canReviewBrainFacts(role: string): boolean {
  return hasRole(role, BRAIN_FACT_REVIEWER_ROLES);
}

/** Trigger discovery runs, and approve/reject/delete discovered target companies. Viewers are read-only. */
export function canManageDiscovery(role: string): boolean {
  return hasRole(role, DISCOVERY_MANAGER_ROLES);
}

/**
 * Only an OWNER can remove another OWNER; any manager can remove everyone
 * else. PlatformAdmin can remove anyone, including an OWNER.
 */
export function canRemoveMember(actingRole: string, targetRole: string): boolean {
  if (isPlatformAdmin(actingRole)) return true;
  if (!canManageWorkspace(actingRole)) return false;
  if (targetRole === ROLES.OWNER) return isOwner(actingRole);
  return true;
}

/**
 * Throws {@link AccessDeniedError} if `role` is not one of `allowed`.
 * Use in server actions / route handlers where failing loudly is preferable
 * to a silent boolean check (e.g. after the UI has already hidden the option).
 */
export function requireRole(role: string, allowed: readonly string[]): void {
  if (!allowed.includes(role)) {
    throw new AccessDeniedError();
  }
}
