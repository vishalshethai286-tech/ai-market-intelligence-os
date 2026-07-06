import Link from "next/link";
import { dashboardNav, siteConfig } from "@/config/site";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-black/[.08] dark:border-white/[.145] sm:block">
      <div className="flex h-16 items-center px-6 font-semibold tracking-tight">
        {siteConfig.shortName}
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {dashboardNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm text-black/70 transition-colors hover:bg-black/[.04] hover:text-current dark:text-white/70 dark:hover:bg-white/[.06]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
