"use client";

import { useState, useTransition } from "react";
import { runDeduplicationAction } from "@/lib/actions/dedup";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

export function RunDeduplicationButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const response = await runDeduplicationAction({ mode: "SCAN_ALL" });
            if (!response.ok) {
              setIsError(true);
              setMessage(response.error);
              return;
            }
            setIsError(false);
            setMessage(
              `Scanned ${response.recordsScanned} records — ${response.duplicatesFound} duplicates found (${response.autoMerged} auto-merged, ${response.pendingReview} pending review).`,
            );
          })
        }
      >
        {isPending && <Spinner />}
        {isPending ? "Running deduplication..." : "Run Deduplication"}
      </Button>
      {message && (
        <p className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
