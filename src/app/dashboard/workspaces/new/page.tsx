import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = {
  title: "Create workspace",
};

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Create a workspace</h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        You&apos;ll be the owner of this new workspace.
      </p>

      <div className="mt-6">
        <CreateWorkspaceForm />
      </div>
    </div>
  );
}
