"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import type { ProductService } from "@/models";
import {
  approveProductServiceAction,
  deleteProductServiceAction,
  rejectProductServiceAction,
  updateProductServiceAction,
} from "@/lib/actions/product-discovery";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE = {
  APPROVED: { variant: "success" as const, label: "Approved" },
  PENDING_REVIEW: { variant: "warning" as const, label: "Needs review" },
  REJECTED: { variant: "danger" as const, label: "Rejected" },
};

export function ProductServiceCard({
  record,
  canEdit,
}: {
  record: ProductService;
  canEdit: boolean;
}) {
  const [state, action, savePending] = useActionState(updateProductServiceAction, undefined);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const confidencePct = Math.round(record.confidenceScore * 100);
  const badge = STATUS_BADGE[record.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{record.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-black/50 dark:text-white/50">{confidencePct}% confidence</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
        <p className="text-xs text-black/50 dark:text-white/50">
          Last verified {record.lastVerifiedAt ? record.lastVerifiedAt.toLocaleDateString() : "never"}
        </p>
        {record.sourceUrls.length > 0 && (
          <p className="text-xs text-black/50 dark:text-white/50">
            Source:{" "}
            {record.sourceUrls.map((url, i) => (
              <span key={url}>
                {i > 0 && ", "}
                <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {url}
                </a>
              </span>
            ))}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={record.id} />
          <fieldset disabled={!canEdit || savePending} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor={`name-${record.id}`}>Name</Label>
                <Input id={`name-${record.id}`} name="name" defaultValue={record.name} className="mt-1" />
                <FieldError>{state?.errors?.name}</FieldError>
              </div>
              <div>
                <Label htmlFor={`type-${record.id}`}>Type</Label>
                <Select id={`type-${record.id}`} name="type" defaultValue={record.type} className="mt-1">
                  <option value="PRODUCT">Product</option>
                  <option value="SERVICE">Service</option>
                </Select>
                <FieldError>{state?.errors?.type}</FieldError>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`category-${record.id}`}>Category</Label>
                <Input
                  id={`category-${record.id}`}
                  name="category"
                  defaultValue={record.category ?? ""}
                  className="mt-1"
                />
                <FieldError>{state?.errors?.category}</FieldError>
              </div>
              <div>
                <Label htmlFor={`subcategory-${record.id}`}>Subcategory</Label>
                <Input
                  id={`subcategory-${record.id}`}
                  name="subcategory"
                  defaultValue={record.subcategory ?? ""}
                  className="mt-1"
                />
                <FieldError>{state?.errors?.subcategory}</FieldError>
              </div>
            </div>

            <div>
              <Label htmlFor={`description-${record.id}`}>Description</Label>
              <Textarea
                id={`description-${record.id}`}
                name="description"
                rows={3}
                defaultValue={record.description ?? ""}
                className="mt-1"
              />
              <FieldError>{state?.errors?.description}</FieldError>
            </div>

            <div>
              <Label htmlFor={`applications-${record.id}`}>Applications</Label>
              <Input
                id={`applications-${record.id}`}
                name="applications"
                defaultValue={record.applications.join(", ")}
                placeholder="Comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.applications}</FieldError>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`targetIndustries-${record.id}`}>Target industries</Label>
                <Input
                  id={`targetIndustries-${record.id}`}
                  name="targetIndustries"
                  defaultValue={record.targetIndustries.join(", ")}
                  placeholder="Comma-separated"
                  className="mt-1"
                />
                <FieldError>{state?.errors?.targetIndustries}</FieldError>
              </div>
              <div>
                <Label htmlFor={`buyerTypes-${record.id}`}>Buyer types</Label>
                <Input
                  id={`buyerTypes-${record.id}`}
                  name="buyerTypes"
                  defaultValue={record.buyerTypes.join(", ")}
                  placeholder="e.g. OEM, Distributor"
                  className="mt-1"
                />
                <FieldError>{state?.errors?.buyerTypes}</FieldError>
              </div>
            </div>

            <div>
              <Label htmlFor={`keywords-${record.id}`}>Keywords</Label>
              <Input
                id={`keywords-${record.id}`}
                name="keywords"
                defaultValue={record.keywords.join(", ")}
                placeholder="Comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.keywords}</FieldError>
            </div>

            <div>
              <Label htmlFor={`synonyms-${record.id}`}>Synonyms</Label>
              <Input
                id={`synonyms-${record.id}`}
                name="synonyms"
                defaultValue={record.synonyms.join(", ")}
                placeholder="Alternate names a buyer might search for, comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.synonyms}</FieldError>
            </div>

            <div>
              <Label htmlFor={`relatedProductsServices-${record.id}`}>Related products/services</Label>
              <Input
                id={`relatedProductsServices-${record.id}`}
                name="relatedProductsServices"
                defaultValue={record.relatedProductsServices.join(", ")}
                placeholder="Comma-separated"
                className="mt-1"
              />
              <FieldError>{state?.errors?.relatedProductsServices}</FieldError>
            </div>

            <details className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
              <summary className="cursor-pointer text-sm font-medium">
                Discovery keywords (projects, tenders, vendor registration)
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                <div>
                  <Label htmlFor={`projectKeywords-${record.id}`}>Project keywords</Label>
                  <Input
                    id={`projectKeywords-${record.id}`}
                    name="projectKeywords"
                    defaultValue={record.projectKeywords.join(", ")}
                    placeholder="Comma-separated"
                    className="mt-1"
                  />
                  <FieldError>{state?.errors?.projectKeywords}</FieldError>
                </div>
                <div>
                  <Label htmlFor={`tenderKeywords-${record.id}`}>Tender keywords</Label>
                  <Input
                    id={`tenderKeywords-${record.id}`}
                    name="tenderKeywords"
                    defaultValue={record.tenderKeywords.join(", ")}
                    placeholder="Comma-separated"
                    className="mt-1"
                  />
                  <FieldError>{state?.errors?.tenderKeywords}</FieldError>
                </div>
                <div>
                  <Label htmlFor={`vendorRegistrationKeywords-${record.id}`}>Vendor registration keywords</Label>
                  <Input
                    id={`vendorRegistrationKeywords-${record.id}`}
                    name="vendorRegistrationKeywords"
                    defaultValue={record.vendorRegistrationKeywords.join(", ")}
                    placeholder="Comma-separated"
                    className="mt-1"
                  />
                  <FieldError>{state?.errors?.vendorRegistrationKeywords}</FieldError>
                </div>
              </div>
            </details>
          </fieldset>

          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="submit" variant="outline" size="sm" disabled={savePending}>
                {savePending ? "Saving..." : "Save changes"}
              </Button>
              {state?.message && <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>}
            </div>
          )}
        </form>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
            <Button
              type="button"
              size="sm"
              disabled={isPending || record.status === "APPROVED"}
              onClick={() =>
                startTransition(async () => {
                  setActionError(null);
                  const result = await approveProductServiceAction(record.id);
                  if (result?.error) setActionError(result.error);
                })
              }
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || record.status === "REJECTED"}
              onClick={() =>
                startTransition(async () => {
                  setActionError(null);
                  const result = await rejectProductServiceAction(record.id);
                  if (result?.error) setActionError(result.error);
                })
              }
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setActionError(null);
                  const result = await deleteProductServiceAction(record.id);
                  if (result?.error) setActionError(result.error);
                })
              }
            >
              Delete
            </Button>
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
