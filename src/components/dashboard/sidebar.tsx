import Link from "next/link";
import { dashboardNav, siteConfig } from "@/config/site";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";

export function Sidebar({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: Array<{ id: string; name: string }>;
  activeWorkspaceId?: string;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-black/[.08] dark:border-white/[.145] sm:flex">
      <div className="flex h-16 items-center px-6 font-semibold tracking-tight">
        {siteConfig.shortName}
      </div>
      <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
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
