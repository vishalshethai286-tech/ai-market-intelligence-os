"use client";

import { useActionState } from "react";
import { saveCountriesStep } from "@/lib/actions/onboarding";
import { TARGET_COUNTRIES } from "@/config/onboarding";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function CountriesForm({ defaultValue }: { defaultValue: string[] }) {
  const [state, action, pending] = useActionState(saveCountriesStep, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {TARGET_COUNTRIES.map((country) => (
          <label key={country.code} className="flex items-center gap-2 text-sm">
            <Checkbox
              name="targetCountries"
              value={country.code}
              defaultChecked={defaultValue.includes(country.code)}
            />
            {country.name}
          </label>
        ))}
      </div>

      <FieldError>{state?.errors?.targetCountries}</FieldError>
      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
