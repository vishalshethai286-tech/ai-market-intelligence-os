"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      {state?.message && (
        <p className="text-sm text-black/70 dark:text-white/70">{state.message}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
