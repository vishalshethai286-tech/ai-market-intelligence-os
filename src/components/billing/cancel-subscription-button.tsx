"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAction } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function CancelSubscriptionButton({ periodEndLabel }: { periodEndLabel: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Cancel subscription
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>Cancel subscription?</DialogTitle>
          <DialogDescription>
            {periodEndLabel
              ? `Your workspace will keep its current plan features until ${periodEndLabel}, then move to the Free Trial plan.`
              : "Your workspace will keep its current plan features until the end of the current billing period."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Keep subscription
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await cancelSubscriptionAction();
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
              })
            }
          >
            {isPending ? "Cancelling..." : "Yes, cancel"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
