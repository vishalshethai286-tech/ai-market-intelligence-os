"use client";

import { useState, useTransition } from "react";
import { createTargetCompanyAction } from "@/lib/actions/discovery";
import type { TargetCompanyFormState } from "@/lib/validations/target-company";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function AddTargetCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TargetCompanyFormState>(undefined);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createTargetCompanyAction(undefined, formData);
      setState(result);
      if (result?.message && !result.errors) {
        setOpen(false);
        setState(undefined);
        form.reset();
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add manually
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>Add a target company</DialogTitle>
          <DialogDescription>
            For a lead discovery didn&apos;t surface. Starts as pending review, same as a discovered target.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-companyName">Company name</Label>
              <Input id="add-companyName" name="companyName" required className="mt-1" />
              <FieldError>{state?.errors?.companyName}</FieldError>
            </div>
            <div>
              <Label htmlFor="add-website">Website</Label>
              <Input id="add-website" name="website" placeholder="https://" className="mt-1" />
              <FieldError>{state?.errors?.website}</FieldError>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-country">Country</Label>
              <Input id="add-country" name="country" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="add-cityState">City / state</Label>
              <Input id="add-cityState" name="cityState" className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-industry">Industry</Label>
              <Input id="add-industry" name="industry" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="add-buyerType">Buyer type</Label>
              <Input id="add-buyerType" name="buyerType" placeholder="e.g. OEM, Distributor" className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="add-matchedProduct">Matched product</Label>
            <Input id="add-matchedProduct" name="matchedProduct" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="add-companyDescription">Description</Label>
            <Textarea id="add-companyDescription" name="companyDescription" rows={2} className="mt-1" />
          </div>

          {state?.message && !state.errors && (
            <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
