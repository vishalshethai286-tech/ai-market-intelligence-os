"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNav, siteConfig } from "@/config/site";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { useMobileNav } from "@/components/dashboard/mobile-nav-context";
import { cn } from "@/lib/cn";

export function Sidebar({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: Array<{ id: string; name: string }>;
  activeWorkspaceId?: string;
}) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-black/[.08] bg-background transition-transform duration-200 ease-out sm:static sm:translate-x-0 dark:border-white/[.145]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 font-semibold tracking-tight">
          {siteConfig.shortName}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-black/50 hover:bg-black/[.04] hover:text-current sm:hidden dark:text-white/50 dark:hover:bg-white/[.06]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />

        <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-4">
          {dashboardNav.map((item) => {
            const isActive =
              item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-black/[.06] font-medium text-current dark:bg-white/[.1]"
                    : "text-black/70 hover:bg-black/[.04] hover:text-current dark:text-white/70 dark:hover:bg-white/[.06]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
