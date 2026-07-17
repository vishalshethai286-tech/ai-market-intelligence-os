"use client";

import { useState, useTransition } from "react";
import { updateCustomerStatusAction, recordCustomerFeedbackAction } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { TargetCustomerStatus } from "@/models";

const STATUS_OPTIONS: TargetCustomerStatus[] = [
  "NEW",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
  "CONTACTED",
  "CONVERTED",
  "ARCHIVED",
];

export function CustomerDetailActions({ id, status }: { id: string; status: TargetCustomerStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-black/60 dark:text-white/60">Status</span>
        <Select
          className="w-auto"
          defaultValue={status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(async () => {
              setError(null);
              const result = await updateCustomerStatusAction(id, e.target.value as TargetCustomerStatus);
              if (!result.ok) setError(result.error);
            })
          }
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordCustomerFeedbackAction(id, "GOOD_FIT");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Good Fit
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordCustomerFeedbackAction(id, "BAD_FIT");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Bad Fit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordCustomerFeedbackAction(id, "NEEDS_REVIEW");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Needs Review
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
