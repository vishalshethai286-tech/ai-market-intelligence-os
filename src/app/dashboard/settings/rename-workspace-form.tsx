"use client";

import { useActionState } from "react";
import { renameWorkspace } from "@/lib/actions/workspace";

export function RenameWorkspaceForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(renameWorkspace, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <div className="flex max-w-sm gap-2">
        <input
          name="name"
          defaultValue={currentName}
          required
          className="flex-1 rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
      {state?.errors?.name && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.errors.name[0]}</p>
      )}
      {state?.message && (
        <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
      )}
    </form>
  );
}
