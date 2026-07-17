import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Invalid reset link</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          This link is missing its reset token.{" "}
          <Link href="/forgot-password" className="font-medium text-current underline underline-offset-4">
            Request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Enter a new password for your account.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  );
}
