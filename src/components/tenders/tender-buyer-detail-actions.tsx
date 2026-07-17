"use client";

import { useState, useTransition } from "react";
import { updateTenderBuyerStatusAction } from "@/lib/actions/tenders";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { TenderBuyerStatus } from "@/models";

const STATUS_OPTIONS: TenderBuyerStatus[] = ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"];

export function TenderBuyerDetailActions({ id, status }: { id: string; status: TenderBuyerStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: TenderBuyerStatus) {
    startTransition(async () => {
      setError(null);
      const result = await updateTenderBuyerStatusAction(id, next);
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
          onChange={(e) => setStatus(e.target.value as TenderBuyerStatus)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus("APPROVED")}>
          Mark Approved
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => setStatus("REJECTED")}>
          Mark Rejected
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("WATCHING")}>
          Mark Watching
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("CONTACTED")}>
          Mark Contacted
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
