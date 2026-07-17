"use client";

import { useState, useTransition } from "react";
import {
  generateContactDiscoveryTargetsAction,
  generateContactSearchQueueAction,
  runContactSearchAction,
  processContactResultsAction,
} from "@/lib/actions/contact-discovery";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

type ActionKey = "targets" | "queue" | "search" | "process";

/** Four independently-triggerable buttons for the Contact Discovery page — each calls just one step of the pipeline (target generation, query generation, search execution, result processing), matching the "keep each step independently callable" requirement. */
export function ContactDiscoveryActions() {
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run(action: ActionKey, task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setActiveAction(action);
    startTransition(async () => {
      setMessage(null);
      const response = await task();
      if (!response.ok) {
        setIsError(true);
        setMessage(response.error);
        return;
      }
      setIsError(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            run("targets", async () => {
              const r = await generateContactDiscoveryTargetsAction();
              if (r.ok) setMessage(`Targets: ${r.targetsCreated} created, ${r.targetsUpdated} updated, ${r.duplicatesSkipped} unchanged, ${r.skipped} skipped.`);
              return r;
            })
          }
        >
          {isPending && activeAction === "targets" && <Spinner />}
          Generate Contact Targets
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            run("queue", async () => {
              const r = await generateContactSearchQueueAction();
              if (r.ok) setMessage(`Queue: ${r.queriesCreated} queries created, ${r.queueItemsCreated} queue items created, ${r.duplicatesSkipped} duplicates skipped.`);
              return r;
            })
          }
        >
          {isPending && activeAction === "queue" && <Spinner />}
          Generate Contact Search Queue
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            run("search", async () => {
              const r = await runContactSearchAction();
              if (r.ok) setMessage(`Search: ${r.queriesExecuted} queries executed, ${r.rawResultsFound} raw results found.`);
              return r;
            })
          }
        >
          {isPending && activeAction === "search" && <Spinner />}
          Run Contact Search
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() =>
            run("process", async () => {
              const r = await processContactResultsAction();
              if (r.ok) {
                setMessage(
                  `Processed ${r.rawResultsProcessed} results — ${r.contactsCreated} contacts created, ${r.contactsUpdated} updated, ${r.skipped} skipped, ${r.failed} failed.`,
                );
              }
              return r;
            })
          }
        >
          {isPending && activeAction === "process" && <Spinner />}
          Process Contact Results
        </Button>
      </div>
      {message && (
        <p className={`max-w-md text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>{message}</p>
      )}
    </div>
  );
}
