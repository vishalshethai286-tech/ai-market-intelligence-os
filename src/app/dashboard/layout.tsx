import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar user={session.user} />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
