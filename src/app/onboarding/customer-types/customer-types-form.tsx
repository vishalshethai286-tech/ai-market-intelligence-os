"use client";

import { useActionState } from "react";
import { saveCustomerTypesStep } from "@/lib/actions/onboarding";
import { CUSTOMER_TYPES } from "@/config/onboarding";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function CustomerTypesForm({ defaultValue }: { defaultValue: string[] }) {
  const [state, action, pending] = useActionState(saveCustomerTypesStep, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CUSTOMER_TYPES.map((type) => (
          <label key={type.code} className="flex items-center gap-2 text-sm">
            <Checkbox
              name="customerTypes"
              value={type.code}
              defaultChecked={defaultValue.includes(type.code)}
            />
            {type.name}
          </label>
        ))}
      </div>

      <FieldError>{state?.errors?.customerTypes}</FieldError>
      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
