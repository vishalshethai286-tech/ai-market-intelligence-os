"use client";

import { useState, useTransition } from "react";
import { updateVendorRegistrationStatusAction } from "@/lib/actions/vendor-registrations";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { VendorRegistrationStatus } from "@/models";

const STATUS_OPTIONS: VendorRegistrationStatus[] = [
  "NEW",
  "REVIEWED",
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
];

export function VendorRegistrationDetailActions({ id, status }: { id: string; status: VendorRegistrationStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: VendorRegistrationStatus) {
    startTransition(async () => {
      setError(null);
      const result = await updateVendorRegistrationStatusAction(id, next);
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
          onChange={(e) => setStatus(e.target.value as VendorRegistrationStatus)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("REVIEWED")}>
          Mark Reviewed
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("NOT_STARTED")}>
          Mark Not Started
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("IN_PROGRESS")}>
          Mark In Progress
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("SUBMITTED")}>
          Mark Submitted
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus("APPROVED")}>
          Mark Approved
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => setStatus("REJECTED")}>
          Mark Rejected
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("ARCHIVED")}>
          Mark Archived
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
