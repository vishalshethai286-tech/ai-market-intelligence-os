"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContactTaskAction } from "@/lib/actions/contact-tasks";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { ContactTaskType, ContactTaskPriority } from "@/models";

const TASK_TYPE_OPTIONS: ContactTaskType[] = ["CALL", "EMAIL", "FOLLOW_UP", "VERIFY", "FIND_EMAIL", "FIND_PHONE", "LINK_OPPORTUNITY", "REVIEW", "OTHER"];

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

/** Ad-hoc task creation from the Contact Tasks page — contactId is a plain text field (this codebase uses loose string ids with no autocomplete widget anywhere), so the usual way to create a task is from the Contact detail page itself; this is for quick entry when you already know the contact id. */
export function CreateContactTaskForm() {
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<ContactTaskType>("FOLLOW_UP");
  const [priority, setPriority] = useState<ContactTaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactId.trim() || !title.trim()) return;
    startTransition(async () => {
      setError(null);
      const result = await createContactTaskAction({
        contactId,
        title,
        taskType,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContactId("");
      setTitle("");
      setDueDate("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <Input placeholder="Contact ID" value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-40" />
      <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-[200px] flex-1" />
      <Select className="w-auto" value={taskType} onChange={(e) => setTaskType(e.target.value as ContactTaskType)}>
        {TASK_TYPE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {label(option)}
          </option>
        ))}
      </Select>
      <Select className="w-auto" value={priority} onChange={(e) => setPriority(e.target.value as ContactTaskPriority)}>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </Select>
      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-auto" />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Create Task"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
