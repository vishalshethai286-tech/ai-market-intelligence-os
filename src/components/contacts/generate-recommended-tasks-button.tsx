"use client";

import { useState, useTransition } from "react";
import { generateMissingContactTasksForWorkspaceAction } from "@/lib/actions/contact-tasks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading";

export function GenerateRecommendedTasksButton() {
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
            const result = await generateMissingContactTasksForWorkspaceAction();
            if (!result.ok) {
              setIsError(true);
              setMessage(result.error);
              return;
            }
            setIsError(false);
            setMessage(`Created ${result.perContactTasksCreated} contact tasks and ${result.entityLevelTasksCreated} "find a contact" tasks.`);
          })
        }
      >
        {isPending && <Spinner />}
        Generate Recommended Tasks
      </Button>
      {message && <p className={`max-w-xs text-right text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>{message}</p>}
    </div>
  );
}
