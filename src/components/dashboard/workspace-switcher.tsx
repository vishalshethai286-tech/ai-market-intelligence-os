"use client";

import Link from "next/link";
import { useTransition } from "react";
import { switchWorkspace } from "@/lib/actions/workspace";
import { useMobileNav } from "@/components/dashboard/mobile-nav-context";
import { Select } from "@/components/ui/select";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: Array<{ id: string; name: string }>;
  activeWorkspaceId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { setOpen } = useMobileNav();

  return (
    <div className="px-3 pb-3">
      <Select
        value={activeWorkspaceId ?? ""}
        disabled={isPending || workspaces.length === 0}
        onChange={(event) => {
          const workspaceId = event.target.value;
          startTransition(async () => {
            await switchWorkspace(workspaceId);
          });
          setOpen(false);
        }}
        className="py-1.5"
      >
        {workspaces.length === 0 && <option value="">No workspace</option>}
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </Select>
      <Link
        href="/dashboard/workspaces/new"
        onClick={() => setOpen(false)}
        className="mt-2 block text-center text-xs text-black/50 hover:text-current dark:text-white/50"
      >
        + Create workspace
      </Link>
    </div>
  );
}
