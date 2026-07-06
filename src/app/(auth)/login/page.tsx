import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Welcome back. Enter your details to continue.
        </p>
      </div>

      <LoginForm />

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-current underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
