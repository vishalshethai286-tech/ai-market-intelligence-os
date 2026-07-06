"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
      </div>

      {state?.message && (
        <p className="text-sm text-black/70 dark:text-white/70">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
