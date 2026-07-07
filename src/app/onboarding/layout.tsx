import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { siteConfig } from "@/config/site";
import { logout } from "@/lib/actions/auth";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-16 items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {siteConfig.name}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-black/50 hover:text-current dark:text-white/50"
          >
            Log out
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-10 sm:items-center">
        {/* Wide enough for the review-profile/review-products steps (full edit forms) while
            still reading fine for the earlier single-field steps. */}
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
