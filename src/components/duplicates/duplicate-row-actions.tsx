"use client";

import { useState, useTransition } from "react";
import { mergeDuplicateAction, markNotDuplicateAction, rejectDuplicateAction, archiveDuplicateAction } from "@/lib/actions/dedup";
import { Button } from "@/components/ui/button";

export function DuplicateRowActions({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "PENDING_REVIEW") {
    return <p className="text-xs text-black/50 dark:text-white/50">Resolved — {status.replace(/_/g, " ").toLowerCase()}</p>;
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" disabled={isPending} onClick={() => run(() => mergeDuplicateAction(id))}>
          Merge
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => run(() => markNotDuplicateAction(id))}>
          Keep separate
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => run(() => rejectDuplicateAction(id))}>
          Reject
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => run(() => archiveDuplicateAction(id))}>
          Archive
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
