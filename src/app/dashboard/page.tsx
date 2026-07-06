import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const active = await requireActiveWorkspace();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {session.user.name ?? session.user.email}
      </h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        {active.workspace.name} &middot; {active.role}
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-black/[.12] p-8 text-center text-sm text-black/50 dark:border-white/[.145] dark:text-white/50">
        Build your first widget here.
      </div>
    </div>
  );
}
