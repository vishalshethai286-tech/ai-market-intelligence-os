import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Navbar() {
  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-black/70 dark:text-white/70 sm:flex">
          {siteConfig.nav.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-current">
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/dashboard"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90"
        >
          Go to dashboard
        </Link>
      </div>
    </header>
  );
}
