import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const context = await getWorkspaceContext();
  const workspaces = (context?.memberships ?? []).map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
  }));

  return (
    <MobileNavProvider>
      <div className="flex min-h-full flex-1">
        <Sidebar workspaces={workspaces} activeWorkspaceId={context?.active?.workspace.id} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={session.user}
            workspaceName={context?.active?.workspace.name}
            role={context?.active?.role}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
