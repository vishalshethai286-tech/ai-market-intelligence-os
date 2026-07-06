"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

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
        {state?.errors?.email && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link href="/forgot-password" className="text-sm text-black/50 hover:text-current dark:text-white/50">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
        {state?.errors?.password && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.message && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
