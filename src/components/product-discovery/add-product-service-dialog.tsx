"use client";

import { useState, useTransition } from "react";
import { createProductServiceAction } from "@/lib/actions/product-discovery";
import type { ProductServiceFormState } from "@/lib/validations/product-service";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function AddProductServiceDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ProductServiceFormState>(undefined);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createProductServiceAction(undefined, formData);
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
          <DialogTitle>Add a product or service</DialogTitle>
          <DialogDescription>
            For anything your website didn&apos;t surface. Starts as pending review, same as an AI-discovered entry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" name="name" required className="mt-1" />
              <FieldError>{state?.errors?.name}</FieldError>
            </div>
            <div>
              <Label htmlFor="add-type">Type</Label>
              <Select id="add-type" name="type" defaultValue="PRODUCT" className="mt-1">
                <option value="PRODUCT">Product</option>
                <option value="SERVICE">Service</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-category">Category</Label>
              <Input id="add-category" name="category" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="add-subcategory">Subcategory</Label>
              <Input id="add-subcategory" name="subcategory" className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="add-description">Description</Label>
            <Textarea id="add-description" name="description" rows={2} className="mt-1" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-targetIndustries">Target industries</Label>
              <Input id="add-targetIndustries" name="targetIndustries" placeholder="Comma-separated" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="add-buyerTypes">Buyer types</Label>
              <Input id="add-buyerTypes" name="buyerTypes" placeholder="e.g. OEM, Distributor" className="mt-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="add-keywords">Keywords</Label>
            <Input id="add-keywords" name="keywords" placeholder="Comma-separated" className="mt-1" />
          </div>

          {/* Fields not exposed in this quick-add form — always sent empty, editable afterward on the card. */}
          <input type="hidden" name="applications" value="" />
          <input type="hidden" name="synonyms" value="" />
          <input type="hidden" name="relatedProductsServices" value="" />
          <input type="hidden" name="projectKeywords" value="" />
          <input type="hidden" name="tenderKeywords" value="" />
          <input type="hidden" name="vendorRegistrationKeywords" value="" />

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
