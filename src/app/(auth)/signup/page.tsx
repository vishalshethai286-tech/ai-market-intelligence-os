import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          We&apos;ll set up a new workspace for you, and you&apos;ll be its owner.
        </p>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-current underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  );
}
