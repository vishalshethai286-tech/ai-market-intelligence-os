"use client";

import { useState, useTransition } from "react";
import { processContactResultsAction } from "@/lib/actions/contact-discovery";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

/** Triggers processContactResults() — optionally scoped to one discovery run (Discovery Run detail page) or workspace-wide (Raw Search Results page). */
export function ProcessContactResultsButton({ discoveryRunId }: { discoveryRunId?: string }) {
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
            const response = await processContactResultsAction(discoveryRunId ? { discoveryRunId } : {});
            if (!response.ok) {
              setIsError(true);
              setMessage(response.error);
              return;
            }
            setIsError(false);
            setMessage(
              `Processed ${response.rawResultsProcessed} results — ${response.contactsCreated} contacts created, ${response.contactsUpdated} updated, ${response.skipped} skipped, ${response.failed} failed.`,
            );
          })
        }
      >
        {isPending && <Spinner />}
        {isPending ? "Processing..." : "Process Contact Results"}
      </Button>
      {message && (
        <p className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
