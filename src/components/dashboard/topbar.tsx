import Link from "next/link";

export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-black/[.08] px-6 dark:border-white/[.145]">
      <Link href="/" className="text-sm text-black/50 hover:text-current dark:text-white/50">
        &larr; Back to site
      </Link>
      <div className="h-8 w-8 rounded-full bg-black/[.08] dark:bg-white/[.145]" />
    </header>
  );
}
