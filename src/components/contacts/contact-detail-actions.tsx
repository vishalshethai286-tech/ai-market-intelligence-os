"use client";

import { useState, useTransition } from "react";
import { changeContactStatusAction, deleteOrArchiveContactAction } from "@/lib/actions/contacts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ContactStatus } from "@/models";

const STATUS_OPTIONS: ContactStatus[] = [
  "NEW",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
  "CONTACTED",
  "RESPONDED",
  "FOLLOW_UP",
  "NOT_RELEVANT",
  "ARCHIVED",
];

export function ContactDetailActions({ id, status }: { id: string; status: ContactStatus }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: ContactStatus) {
    startTransition(async () => {
      setError(null);
      const result = await changeContactStatusAction(id, next);
      if (!result.ok) setError(result.error);
    });
  }

  function archive() {
    startTransition(async () => {
      setError(null);
      const result = await deleteOrArchiveContactAction(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-black/60 dark:text-white/60">Status</span>
        <Select className="w-auto" defaultValue={status} disabled={isPending} onChange={(e) => setStatus(e.target.value as ContactStatus)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => setStatus("CONTACTED")}>
          Mark Contacted
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("FOLLOW_UP")}>
          Mark Follow Up
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setStatus("RESPONDED")}>
          Mark Responded
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => setStatus("NOT_RELEVANT")}>
          Mark Not Relevant
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={archive}>
          Archive Contact
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
