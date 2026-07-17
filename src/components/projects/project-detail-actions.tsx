"use client";

import { useState, useTransition } from "react";
import { updateProjectStatusAction, recordProjectFeedbackAction } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ProjectOpportunityStatus } from "@/models";

const STATUS_OPTIONS: ProjectOpportunityStatus[] = ["NEW", "REVIEWED", "APPROVED", "REJECTED", "WATCHING", "CONTACTED", "ARCHIVED"];

export function ProjectDetailActions({ id, status }: { id: string; status: ProjectOpportunityStatus }) {
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
              const result = await updateProjectStatusAction(id, e.target.value as ProjectOpportunityStatus);
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
              const result = await recordProjectFeedbackAction(id, "HIGH_POTENTIAL");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark High Potential
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordProjectFeedbackAction(id, "NOT_RELEVANT");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Not Relevant
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordProjectFeedbackAction(id, "WATCHING");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Watching
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await recordProjectFeedbackAction(id, "CONTACTED");
              if (!result.ok) setError(result.error);
            })
          }
        >
          Mark Contacted
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
