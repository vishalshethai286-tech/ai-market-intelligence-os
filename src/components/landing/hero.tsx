import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Hero() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
      <p className="text-sm font-medium uppercase tracking-widest text-black/50 dark:text-white/50">
        AI Market Intelligence OS
      </p>
      <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Turn market noise into decisions
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-black/60 dark:text-white/60 sm:text-lg">
        {siteConfig.description}
      </p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
        >
          Get started
        </Link>
        <a
          href="#product"
          className="rounded-full border border-black/[.08] px-6 py-3 text-sm font-medium transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          Learn more
        </a>
      </div>
    </section>
  );
}
