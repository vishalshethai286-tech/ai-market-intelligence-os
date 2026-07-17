"use client";

import { useState, useTransition } from "react";
import { acceptWorkspaceInvite } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptWorkspaceInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {isPending ? "Accepting..." : "Accept invite"}
      </Button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
