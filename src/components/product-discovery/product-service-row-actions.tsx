"use client";

import { useState, useTransition } from "react";
import {
  approveProductServiceAction,
  rejectProductServiceAction,
} from "@/lib/actions/product-discovery";
import { Button } from "@/components/ui/button";

export function ProductServiceRowActions({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        disabled={isPending || status === "APPROVED"}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await approveProductServiceAction(id);
            if (result?.error) setError(result.error);
          })
        }
      >
        Approve
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending || status === "REJECTED"}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await rejectProductServiceAction(id);
            if (result?.error) setError(result.error);
          })
        }
      >
        Reject
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
