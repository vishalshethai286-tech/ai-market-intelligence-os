"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContactTaskAction } from "@/lib/actions/contact-tasks";
import { Button } from "@/components/ui/button";
import type { ContactLinkableRecordType } from "@/models";

/** "Create Follow-up Task" on a related-entity detail page — an entity-level task (contactId null, relatedRecordType/relatedRecordId set), for when you want a reminder to work on this record even before a specific contact exists. */
export function CreateEntityFollowUpTaskButton({
  recordType,
  recordId,
  recordLabel,
}: {
  recordType: ContactLinkableRecordType;
  recordId: string;
  recordLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await createContactTaskAction({
              relatedRecordType: recordType,
              relatedRecordId: recordId,
              title: `Follow up on ${recordLabel}`,
              taskType: "FOLLOW_UP",
              priority: "MEDIUM",
            });
            setMessage(result.ok ? "Task created — see Contact Tasks." : result.error);
            if (result.ok) router.refresh();
          })
        }
      >
        Create Follow-up Task
      </Button>
      {message && <p className="text-xs text-black/50 dark:text-white/50">{message}</p>}
    </div>
  );
}
