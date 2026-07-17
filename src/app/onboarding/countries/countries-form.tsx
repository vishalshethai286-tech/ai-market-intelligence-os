"use client";

import { useActionState, useState } from "react";
import { saveCountriesStep } from "@/lib/actions/onboarding";
import { TARGET_COUNTRIES, WORLDWIDE_CODE } from "@/config/onboarding";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function CountriesForm({ defaultValue }: { defaultValue: string[] }) {
  const [state, action, pending] = useActionState(saveCountriesStep, undefined);
  const [worldwide, setWorldwide] = useState(defaultValue.includes(WORLDWIDE_CODE));

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 border-b border-black/[.08] pb-3 text-sm font-medium dark:border-white/[.145]">
        <Checkbox
          name="targetCountries"
          value={WORLDWIDE_CODE}
          checked={worldwide}
          onChange={(e) => setWorldwide(e.target.checked)}
        />
        Worldwide — sell into every country
      </label>

      <div
        aria-disabled={worldwide}
        className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 aria-disabled:pointer-events-none aria-disabled:opacity-40"
      >
        {TARGET_COUNTRIES.map((country) => (
          <label key={country.code} className="flex items-center gap-2 text-sm">
            <Checkbox
              name="targetCountries"
              value={country.code}
              disabled={worldwide}
              defaultChecked={defaultValue.includes(country.code)}
            />
            {country.name}
          </label>
        ))}
      </div>

      <p className="text-xs text-black/50 dark:text-white/50">Optional — you can skip this and add it later.</p>

      <FieldError>{state?.errors?.targetCountries}</FieldError>
      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
