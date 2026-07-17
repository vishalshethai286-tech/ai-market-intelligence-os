import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { siteConfig } from "@/config/site";
import { logout } from "@/lib/actions/auth";

const PLATFORM_ADMIN_NAV = [
  { label: "Overview", href: "/platform-admin" },
  { label: "Workspaces", href: "/platform-admin/workspaces" },
  { label: "Users", href: "/platform-admin/users" },
] as const;

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center justify-between border-b border-black/[.08] px-6 dark:border-white/[.145]">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            {siteConfig.name}
          </Link>
          <span className="rounded-full bg-black/[.06] px-2.5 py-0.5 text-xs font-medium dark:bg-white/[.1]">
            Platform Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-black/50 hover:text-current dark:text-white/50">
            Back to dashboard
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-black/50 hover:text-current dark:text-white/50">
              Log out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/[.08] p-4 dark:border-white/[.145]">
          {PLATFORM_ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-black/70 transition-colors hover:bg-black/[.04] hover:text-current dark:text-white/70 dark:hover:bg-white/[.06]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
