"use client";

import Link from "next/link";
import { useTransition } from "react";
import { switchWorkspace } from "@/lib/actions/workspace";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: Array<{ id: string; name: string }>;
  activeWorkspaceId?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="px-3 pb-3">
      <select
        value={activeWorkspaceId ?? ""}
        disabled={isPending || workspaces.length === 0}
        onChange={(event) => {
          const workspaceId = event.target.value;
          startTransition(async () => {
            await switchWorkspace(workspaceId);
          });
        }}
        className="w-full rounded-md border border-black/[.08] bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-50 dark:border-white/[.145]"
      >
        {workspaces.length === 0 && <option value="">No workspace</option>}
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <Link
        href="/dashboard/workspaces/new"
        className="mt-2 block text-center text-xs text-black/50 hover:text-current dark:text-white/50"
      >
        + Create workspace
      </Link>
    </div>
  );
}
