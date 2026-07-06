"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/lib/actions/workspace";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Workspace name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Acme Sales Team"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
        {state?.errors?.name && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.errors.name[0]}</p>
        )}
      </div>

      {state?.message && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create workspace"}
      </button>
    </form>
  );
}
