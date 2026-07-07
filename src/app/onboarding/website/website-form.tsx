"use client";

import { useActionState } from "react";
import { saveWebsiteStep } from "@/lib/actions/onboarding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function WebsiteForm({ defaultValue }: { defaultValue?: string }) {
  const [state, action, pending] = useActionState(saveWebsiteStep, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyWebsite">Company website</Label>
        <Input
          id="companyWebsite"
          name="companyWebsite"
          type="text"
          inputMode="url"
          placeholder="acme.com"
          defaultValue={defaultValue}
          autoFocus
          required
        />
        <FieldError>{state?.errors?.companyWebsite}</FieldError>
      </div>

      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
