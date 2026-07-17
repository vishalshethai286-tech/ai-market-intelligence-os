"use client";

import { useState, useTransition } from "react";
import { generateDiscoveryQueueAction } from "@/lib/actions/discovery-brain";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

export function GenerateQueueButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const response = await generateDiscoveryQueueAction();
            if (!response.ok) {
              setIsError(true);
              setMessage(response.error);
              return;
            }
            setIsError(false);
            setMessage(
              response.queriesCreated > 0
                ? `Planned ${response.queriesPlanned} candidate queries, queued ${response.queriesCreated} new ones.`
                : `Planned ${response.queriesPlanned} candidate queries — all already queued, nothing new.`,
            );
          })
        }
      >
        {isPending && <Spinner />}
        {isPending ? "Generating queue..." : "Generate Discovery Queue"}
      </Button>
      {message && (
        <p
          className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
