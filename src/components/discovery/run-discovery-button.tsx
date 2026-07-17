"use client";

import { useState, useTransition } from "react";
import { runDiscoveryAction } from "@/lib/actions/discovery";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

export function RunDiscoveryButton() {
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
            const response = await runDiscoveryAction();
            if (!response.ok) {
              setIsError(true);
              setMessage(response.error);
              return;
            }
            setIsError(false);
            const { created, evaluated, queriesRun, searchQueriesGenerated } = response.result;
            setMessage(
              searchQueriesGenerated > 0
                ? `Generated ${searchQueriesGenerated} search queries, ran ${queriesRun}, evaluated ${evaluated} results, found ${created} new companies.`
                : `Ran ${queriesRun} queries, evaluated ${evaluated} results, found ${created} new companies.`,
            );
          })
        }
      >
        {isPending && <Spinner />}
        {isPending ? "Running discovery..." : "Run discovery now"}
      </Button>
      {message && (
        <p className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
