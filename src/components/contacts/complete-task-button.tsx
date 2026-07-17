"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeContactTaskAction } from "@/lib/actions/contact-tasks";
import { Button } from "@/components/ui/button";

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await completeContactTaskAction(taskId);
          router.refresh();
        })
      }
    >
      Complete
    </Button>
  );
}
