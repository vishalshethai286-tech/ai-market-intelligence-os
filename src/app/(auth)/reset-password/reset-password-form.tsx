"use client";

import { useActionState } from "react";
import { resetPassword } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, token), undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
        <FieldError>{state?.errors?.password}</FieldError>
      </div>

      {state?.message && <p className="text-sm text-black/70 dark:text-white/70">{state.message}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Resetting..." : "Reset password"}
      </Button>
    </form>
  );
}
