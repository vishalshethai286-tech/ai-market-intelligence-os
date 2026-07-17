"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refreshContactEnrichmentAction,
  markContactDoNotContactAction,
  removeContactDoNotContactAction,
  assignContactOwnerAction,
  assignContactToUserAction,
} from "@/lib/actions/contacts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssignableWorkspaceMember } from "@/lib/workspace";

/** Refresh Enrichment / Mark-or-Remove Do Not Contact / Assign Owner / Assign To — the Contact detail page's CRM action cluster. Every action re-runs enrichment server-side (see contacts/service.ts's applyEnrichment), so this component just triggers + refreshes. */
export function ContactCrmActions({
  contactId,
  doNotContact,
  ownerUserId,
  assignedToUserId,
  members,
}: {
  contactId: string;
  doNotContact: boolean;
  ownerUserId: string | null;
  assignedToUserId: string | null;
  members: AssignableWorkspaceMember[];
}) {
  const [isPending, startTransition] = useTransition();
  const [dncReason, setDncReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await task();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => run(() => refreshContactEnrichmentAction(contactId))}>
          Refresh Enrichment
        </Button>
        {doNotContact ? (
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => run(() => removeContactDoNotContactAction(contactId))}>
            Remove Do Not Contact
          </Button>
        ) : (
          <>
            <Input
              placeholder="Reason (optional)"
              value={dncReason}
              onChange={(e) => setDncReason(e.target.value)}
              className="w-48"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => markContactDoNotContactAction(contactId, dncReason || undefined))}
            >
              Mark Do Not Contact
            </Button>
          </>
        )}
      </div>

      {members.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ownerUserId">Owner</Label>
            <Select
              id="ownerUserId"
              className="mt-1 w-auto"
              defaultValue={ownerUserId ?? ""}
              disabled={isPending}
              onChange={(e) => run(() => assignContactOwnerAction(contactId, e.target.value))}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assignedToUserId">Assigned to</Label>
            <Select
              id="assignedToUserId"
              className="mt-1 w-auto"
              defaultValue={assignedToUserId ?? ""}
              disabled={isPending}
              onChange={(e) => run(() => assignContactToUserAction(contactId, e.target.value))}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
