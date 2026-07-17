"use client";

import { useState, useTransition } from "react";
import { processTenderResultsAction } from "@/lib/actions/tenders";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

/** Triggers processTenderResults() — optionally scoped to one discovery run (Discovery Run detail page) or workspace-wide (Tender Buyers / Live Tenders / Raw Search Results pages). */
export function ProcessTenderResultsButton({ discoveryRunId }: { discoveryRunId?: string }) {
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
            const response = await processTenderResultsAction(discoveryRunId ? { discoveryRunId } : {});
            if (!response.ok) {
              setIsError(true);
              setMessage(response.error);
              return;
            }
            setIsError(false);
            setMessage(
              `Processed ${response.rawResultsProcessed} results — ${response.tenderBuyersCreated} buyers created, ${response.tenderOpportunitiesCreated} tenders created, ${response.skipped} skipped, ${response.failed} failed.`,
            );
          })
        }
      >
        {isPending && <Spinner />}
        {isPending ? "Processing..." : "Process Tender Results"}
      </Button>
      {message && (
        <p className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
