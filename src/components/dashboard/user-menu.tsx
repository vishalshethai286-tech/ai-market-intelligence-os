"use client";

import * as React from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { logout } from "@/lib/actions/auth";

function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  user,
  workspaceName,
  role,
}: {
  user: Session["user"];
  workspaceName?: string;
  role?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.08] text-sm font-medium transition-opacity hover:opacity-80 dark:bg-white/[.145]"
      >
        {initials(user.name, user.email ?? "?")}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-black/[.08] bg-background p-1 shadow-lg dark:border-white/[.145]"
        >
          <div className="border-b border-black/[.08] px-3 py-2 dark:border-white/[.145]">
            <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-xs text-black/50 dark:text-white/50">{user.email}</p>
            {workspaceName && (
              <p className="mt-1 truncate text-xs text-black/50 dark:text-white/50">
                {workspaceName}
                {role ? ` · ${role}` : ""}
              </p>
            )}
          </div>

          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block rounded-md px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Workspace settings
          </Link>

          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
