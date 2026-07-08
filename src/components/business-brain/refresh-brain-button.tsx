"use client";

import { useState, useTransition } from "react";
import { refreshBrainAction } from "@/lib/actions/business-brain";
import { Button } from "@/components/ui/button";

export function RefreshBrainButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await refreshBrainAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.summary) {
        const { changed, created, updated, expired, flagged } = result.summary;
        setMessage(
          changed
            ? `Refreshed: ${created} new, ${updated} updated, ${expired} expired, ${flagged} flagged for review.`
            : "Refreshed — no changes detected on the website.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={refresh}>
        {isPending ? "Refreshing…" : "Refresh brain"}
      </Button>
      {message && <p className="max-w-56 text-right text-xs text-black/60 dark:text-white/60">{message}</p>}
      {error && <p className="max-w-56 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
