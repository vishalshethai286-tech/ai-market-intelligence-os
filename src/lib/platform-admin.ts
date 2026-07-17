import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Parses PLATFORM_ADMIN_EMAILS once per call — cheap, and env doesn't change at runtime. */
function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True if `email` is in PLATFORM_ADMIN_EMAILS — a global, workspace-independent
 * check against the session, distinct from the per-workspace `PLATFORM_ADMIN`
 * role in access-control.ts (a member can hold that role in one workspace
 * without their email being here, and vice versa).
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase());
}

/** Guard for every /platform-admin page: requires a session whose email is in PLATFORM_ADMIN_EMAILS. */
export async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!isPlatformAdminEmail(session.user.email)) {
    redirect("/dashboard");
  }
  return session;
}
