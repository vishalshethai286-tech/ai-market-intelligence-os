"use client";

import { useState, useTransition } from "react";
import { updateTenderOpportunityStatusAction } from "@/lib/actions/tenders";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { TenderOpportunityStatus } from "@/models";

const STATUS_OPTIONS: TenderOpportunityStatus[] = [
  "NEW",
  "REVIEWED",
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "SUBMITTED",
  "WON",
  "LOST",
  "EXPIRED",
  "ARCHIVED",
];

export function TenderOpportunityDetailActions({ id, status }: { id: string; status: TenderOpportunityStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: TenderOpportunityStatus) {
    startTransition(async () => {
      setError(null);
      const result = await updateTenderOpportunityStatusAction(id, next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-black/60 dark:text-white/60">Status</span>
        <Select
          className="w-auto"
          defaultValue={status}
          disabled={isPending}
          onChange={(e) => setStatus(e.target.value as TenderOpportunityStatus)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus("ELIGIBLE")}>
          Mark Eligible
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => setStatus("NOT_ELIGIBLE")}>
          Mark Not Eligible
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("SUBMITTED")}>
          Mark Submitted
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("WON")}>
          Mark Won
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("LOST")}>
          Mark Lost
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("ARCHIVED")}>
          Mark Archived
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
