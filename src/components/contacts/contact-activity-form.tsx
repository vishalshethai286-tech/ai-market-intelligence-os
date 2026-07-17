"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addContactActivityAction } from "@/lib/actions/contacts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactActivityType, ContactActivityOutcome } from "@/models";

const ACTIVITY_TYPE_OPTIONS: { value: ContactActivityType; label: string }[] = [
  { value: "NOTE", label: "Add Note" },
  { value: "CALL", label: "Add Call Log" },
  { value: "EMAIL", label: "Add Email Log" },
  { value: "MEETING", label: "Add Meeting" },
  { value: "FOLLOW_UP", label: "Add Follow-up" },
  { value: "OTHER", label: "Other" },
];

const OUTCOME_OPTIONS: ContactActivityOutcome[] = [
  "CONNECTED",
  "NO_ANSWER",
  "LEFT_MESSAGE",
  "EMAIL_SENT",
  "EMAIL_DRAFTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "WRONG_PERSON",
  "REFERRED",
  "FOLLOW_UP_REQUIRED",
  "COMPLETED",
  "OTHER",
];

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

/** Quick activity buttons (Log Call/Log Email/Add Note/Add Follow-up) preset the type; the form itself still lets the user pick any type, an outcome, and a next follow-up date. */
export function ContactActivityForm({ contactId }: { contactId: string }) {
  const [activityType, setActivityType] = useState<ContactActivityType>("NOTE");
  const [outcome, setOutcome] = useState<ContactActivityOutcome | "">("");
  const [description, setDescription] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await addContactActivityAction(contactId, {
        activityType,
        description: description || undefined,
        outcome: outcome || undefined,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDescription("");
      setOutcome("");
      setNextFollowUpAt("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setActivityType("CALL")}>
          Log Call
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setActivityType("EMAIL")}>
          Log Email
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setActivityType("NOTE")}>
          Add Note
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setActivityType("FOLLOW_UP")}>
          Add Follow-up
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="activityType">Type</Label>
          <Select
            id="activityType"
            className="mt-1 w-auto"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ContactActivityType)}
          >
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="outcome">Outcome</Label>
          <Select id="outcome" className="mt-1 w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value as ContactActivityOutcome | "")}>
            <option value="">No outcome</option>
            {OUTCOME_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nextFollowUpAt">Next follow-up</Label>
          <Input
            id="nextFollowUpAt"
            type="date"
            className="mt-1"
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
          />
        </div>
      </div>
      <Textarea
        rows={2}
        placeholder="What happened?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Log activity"}
        </Button>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </form>
  );
}
