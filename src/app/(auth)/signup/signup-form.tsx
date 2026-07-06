"use client";

import { useActionState } from "react";
import { signup } from "@/lib/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
        {state?.errors?.name && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.errors.name[0]}</p>
        )}
      </div>

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
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/40"
        />
        {state?.errors?.password ? (
          <ul className="text-sm text-red-600 dark:text-red-400">
            {state.errors.password.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-black/50 dark:text-white/50">
            At least 8 characters, with a letter and a number.
          </p>
        )}
      </div>

      {state?.message && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
