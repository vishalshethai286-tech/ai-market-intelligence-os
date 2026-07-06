export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  SALES_USER: "SALES_USER",
  VIEWER: "VIEWER",
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

export function isOwner(role: string): boolean {
  return role === ROLES.OWNER;
}

/** Rename the workspace, change settings, remove non-owner members. */
export function canManageWorkspace(role: string): boolean {
  return WORKSPACE_MANAGER_ROLES.includes(role);
}

/** Invite new members. */
export function canInviteMembers(role: string): boolean {
  return MEMBER_INVITER_ROLES.includes(role);
}

/** View/change plan and payment details. */
export function canManageBilling(role: string): boolean {
  return BILLING_MANAGER_ROLES.includes(role);
}

/** Only an OWNER can remove another OWNER; any manager can remove everyone else. */
export function canRemoveMember(actingRole: string, targetRole: string): boolean {
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
