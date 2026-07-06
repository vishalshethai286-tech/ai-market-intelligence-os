import Link from "next/link";
import type { Session } from "next-auth";
import { logout } from "@/lib/actions/auth";

export function Topbar({ user }: { user: Session["user"] }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-black/[.08] px-6 dark:border-white/[.145]">
      <Link href="/" className="text-sm text-black/50 hover:text-current dark:text-white/50">
        &larr; Back to site
      </Link>

      <div className="flex items-center gap-4">
        <div className="text-right text-sm">
          <p className="font-medium">{user.name ?? user.email}</p>
          <p className="text-black/50 dark:text-white/50">{user.workspaceName}</p>
        </div>
        <div className="h-8 w-8 shrink-0 rounded-full bg-black/[.08] dark:bg-white/[.145]" />
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06]"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
