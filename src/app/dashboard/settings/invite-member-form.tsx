"use client";

import { useActionState } from "react";
import { inviteMember } from "@/lib/actions/workspace";

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(inviteMember, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="SALES_USER"
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
          >
            <option value="ADMIN">Admin</option>
            <option value="SALES_USER">Sales User</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>
      </div>

      {state?.errors?.email && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.errors.email[0]}</p>
      )}
      {state?.message && (
        <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send invite"}
      </button>
    </form>
  );
}
