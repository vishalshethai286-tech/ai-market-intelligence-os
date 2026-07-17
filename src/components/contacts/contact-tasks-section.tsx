"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContactTaskAction, completeContactTaskAction } from "@/lib/actions/contact-tasks";
import { generateRecommendedContactTasksAction } from "@/lib/actions/contact-tasks";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ContactTask, ContactTaskType, ContactTaskPriority } from "@/models";

const TASK_TYPE_OPTIONS: ContactTaskType[] = ["CALL", "EMAIL", "FOLLOW_UP", "VERIFY", "FIND_EMAIL", "FIND_PHONE", "LINK_OPPORTUNITY", "REVIEW", "OTHER"];

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

/** Tasks section on the Contact detail page — lists open/completed tasks for this one contact, a quick "create task" form, one-click complete, and a "Create Recommended Task" shortcut driven by the contact's current recommendedAction. */
export function ContactTasksSection({ contactId, tasks }: { contactId: string; tasks: (ContactTask & { isOverdue: boolean })[] }) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<ContactTaskType>("FOLLOW_UP");
  const [priority, setPriority] = useState<ContactTaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
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
      setTitle("");
      setDueDate("");
      router.refresh();
    });
  }

  function complete(taskId: string) {
    startTransition(async () => {
      setError(null);
      const result = await completeContactTaskAction(taskId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function createRecommended() {
    startTransition(async () => {
      setError(null);
      const result = await generateRecommendedContactTasksAction(contactId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const openTasks = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
        <div className="flex flex-wrap items-end gap-3">
          <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-[220px] flex-1" />
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
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving..." : "Create Task"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={createRecommended}>
            Create Recommended Task
          </Button>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </form>

      {openTasks.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">No open tasks for this contact.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  <Badge variant="outline">{label(task.taskType)}</Badge>
                  <Badge variant={task.priority === "HIGH" ? "danger" : task.priority === "MEDIUM" ? "warning" : "outline"}>{label(task.priority)}</Badge>
                  {task.isOverdue && <Badge variant="danger">Overdue</Badge>}
                </div>
                {task.dueDate && <p className="mt-1 text-xs text-black/50 dark:text-white/50">Due {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => complete(task.id)}>
                Complete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {completedTasks.length > 0 && (
        <details className="text-sm text-black/50 dark:text-white/50">
          <summary className="cursor-pointer">Recently completed ({completedTasks.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {completedTasks.slice(0, 10).map((task) => (
              <li key={task.id}>
                {task.title} — {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : "—"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
