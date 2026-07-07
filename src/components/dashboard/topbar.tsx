"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { useMobileNav } from "@/components/dashboard/mobile-nav-context";
import { UserMenu } from "@/components/dashboard/user-menu";

export function Topbar({
  user,
  workspaceName,
  role,
}: {
  user: Session["user"];
  workspaceName?: string;
  role?: string;
}) {
  const { setOpen } = useMobileNav();

  return (
    <header className="flex h-16 items-center justify-between border-b border-black/[.08] px-4 sm:px-6 dark:border-white/[.145]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-black/70 hover:bg-black/[.04] sm:hidden dark:text-white/70 dark:hover:bg-white/[.06]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2.75 9.25a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <Link href="/" className="hidden text-sm text-black/50 hover:text-current sm:block dark:text-white/50">
          &larr; Back to site
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden text-right text-sm sm:block">
          <p className="font-medium">{user.name ?? user.email}</p>
          <p className="text-black/50 dark:text-white/50">
            {workspaceName ?? "No workspace"}
            {role ? ` · ${role}` : ""}
          </p>
        </div>
        <UserMenu user={user} workspaceName={workspaceName} role={role} />
      </div>
    </header>
  );
}
