"use client";

import { useState, useTransition } from "react";
import { approveCompanyProfileAction } from "@/lib/actions/company-profile";
import { Button } from "@/components/ui/button";

export function ApproveButton({ approved }: { approved: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={isPending || approved}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await approveCompanyProfileAction();
            if (result?.error) setError(result.error);
          })
        }
      >
        {approved ? "Approved" : isPending ? "Approving..." : "Approve profile"}
      </Button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
