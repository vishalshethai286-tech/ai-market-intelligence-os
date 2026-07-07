"use client";

import { useActionState } from "react";
import { saveWorkEmailStep } from "@/lib/actions/onboarding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function EmailForm({ defaultValue }: { defaultValue?: string }) {
  const [state, action, pending] = useActionState(saveWorkEmailStep, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workEmail">Work email</Label>
        <Input
          id="workEmail"
          name="workEmail"
          type="email"
          placeholder="you@acme.com"
          defaultValue={defaultValue}
          autoFocus
          required
        />
        <FieldError>{state?.errors?.workEmail}</FieldError>
      </div>

      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
