"use client";

import { useActionState } from "react";
import type { CompanyProfile } from "@/models";
import { updateCompanyProfileAction } from "@/lib/actions/company-profile";
import { OPERATION_TYPE_LABELS, OPERATION_TYPES } from "@/lib/company-profile/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Badge } from "@/components/ui/badge";
import { ApproveButton } from "./approve-button";
import { RegenerateButton } from "./regenerate-button";

export function CompanyProfileForm({
  profile,
  canEdit,
}: {
  profile: CompanyProfile;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateCompanyProfileAction, undefined);

  const confidencePct = Math.round(profile.confidenceScore * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/[.08] p-4 text-sm dark:border-white/[.145]">
        <span className="text-black/60 dark:text-white/60">
          AI confidence: <span className="font-medium text-foreground">{confidencePct}%</span>
        </span>
        {profile.sourceUrls.length > 0 && (
          <span className="text-black/60 dark:text-white/60">
            Source:{" "}
            {profile.sourceUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-2"
              >
                {url}
              </a>
            ))}
          </span>
        )}
        {profile.status === "APPROVED" && profile.approvedAt && (
          <Badge variant="success">Approved {profile.approvedAt.toLocaleDateString()}</Badge>
        )}
      </div>

      <form action={action} className="flex flex-col gap-5">
        <fieldset disabled={!canEdit || pending} className="flex flex-col gap-5">
          <div>
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              name="companyName"
              defaultValue={profile.companyName ?? ""}
              className="mt-1"
            />
            <FieldError>{state?.errors?.companyName}</FieldError>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={profile.website ?? ""} className="mt-1" />
              <FieldError>{state?.errors?.website}</FieldError>
            </div>
            <div>
              <Label htmlFor="workEmail">Work email</Label>
              <Input
                id="workEmail"
                name="workEmail"
                type="email"
                defaultValue={profile.workEmail ?? ""}
                className="mt-1"
              />
              <FieldError>{state?.errors?.workEmail}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="businessDescription">Business description</Label>
            <Textarea
              id="businessDescription"
              name="businessDescription"
              rows={4}
              defaultValue={profile.businessDescription ?? ""}
              className="mt-1"
            />
            <FieldError>{state?.errors?.businessDescription}</FieldError>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" defaultValue={profile.industry ?? ""} className="mt-1" />
              <FieldError>{state?.errors?.industry}</FieldError>
            </div>

            <div>
              <Label htmlFor="businessModel">Business model</Label>
              <Input
                id="businessModel"
                name="businessModel"
                defaultValue={profile.businessModel ?? ""}
                placeholder="e.g. B2B, B2C, Marketplace"
                className="mt-1"
              />
              <FieldError>{state?.errors?.businessModel}</FieldError>
            </div>

            <div>
              <Label htmlFor="headquarters">Headquarters</Label>
              <Input
                id="headquarters"
                name="headquarters"
                defaultValue={profile.headquarters ?? ""}
                className="mt-1"
              />
              <FieldError>{state?.errors?.headquarters}</FieldError>
            </div>

            <div>
              <Label htmlFor="operationType">Manufacturing / trading / service type</Label>
              <Select
                id="operationType"
                name="operationType"
                defaultValue={profile.operationType}
                className="mt-1"
              >
                {OPERATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {OPERATION_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
              <FieldError>{state?.errors?.operationType}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="countriesServed">Countries served</Label>
            <Input
              id="countriesServed"
              name="countriesServed"
              defaultValue={profile.countriesServed.join(", ")}
              placeholder="Comma-separated, e.g. United States, Germany, India"
              className="mt-1"
            />
            <FieldError>{state?.errors?.countriesServed}</FieldError>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="targetCountries">Target countries</Label>
              <Input
                id="targetCountries"
                name="targetCountries"
                defaultValue={profile.targetCountries.join(", ")}
                placeholder="ISO codes or WORLDWIDE, comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.targetCountries}</FieldError>
            </div>
            <div>
              <Label htmlFor="preferredCustomerTypes">Preferred customer types</Label>
              <Input
                id="preferredCustomerTypes"
                name="preferredCustomerTypes"
                defaultValue={profile.preferredCustomerTypes.join(", ")}
                placeholder="Comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.preferredCustomerTypes}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="keyProductsServices">Key products / services</Label>
            <Input
              id="keyProductsServices"
              name="keyProductsServices"
              defaultValue={profile.keyProductsServices.join(", ")}
              placeholder="Comma-separated"
              className="mt-1"
            />
            <FieldError>{state?.errors?.keyProductsServices}</FieldError>
          </div>

          <div>
            <Label htmlFor="certifications">Certifications</Label>
            <Input
              id="certifications"
              name="certifications"
              defaultValue={profile.certifications.join(", ")}
              placeholder="Comma-separated, e.g. ISO 9001, CE"
              className="mt-1"
            />
            <FieldError>{state?.errors?.certifications}</FieldError>
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
            {state?.message && (
              <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
            )}
          </div>
        )}
      </form>

      {canEdit && (
        <div className="flex flex-wrap items-start gap-3 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
          <ApproveButton approved={profile.status === "APPROVED"} />
          <RegenerateButton label="Regenerate from latest analysis" />
        </div>
      )}
    </div>
  );
}
