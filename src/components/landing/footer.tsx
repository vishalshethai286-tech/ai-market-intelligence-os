import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-t border-black/[.08] dark:border-white/[.145]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-black/50 dark:text-white/50 sm:flex-row">
        <p>
          &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-current">
            Privacy
          </a>
          <a href="#" className="hover:text-current">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
