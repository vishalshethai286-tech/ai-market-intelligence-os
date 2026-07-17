import type { Metadata } from "next";
import { auth } from "@/auth";
import { requireActiveWorkspace, listActiveWorkspaceMembers } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listContactTasks, listMyContactTasks, getOverdueContactTasks } from "@/lib/contacts/tasks";
import { getContactNamesByIds } from "@/lib/contacts/service";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExportCsvLink } from "@/components/ui/export-csv-link";
import { CompleteTaskButton } from "@/components/contacts/complete-task-button";
import { CreateContactTaskForm } from "@/components/contacts/create-contact-task-form";
import { GenerateRecommendedTasksButton } from "@/components/contacts/generate-recommended-tasks-button";
import type { ContactTask } from "@/models";

export const metadata: Metadata = { title: "Contact Tasks" };

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

function TaskTable({ tasks, contactNames }: { tasks: (ContactTask & { isOverdue: boolean })[]; contactNames: Record<string, string> }) {
  if (tasks.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">Nothing here.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell className="text-black/60 dark:text-white/60">{task.contactId ? (contactNames[task.contactId] ?? "—") : "—"}</TableCell>
              <TableCell className="text-black/60 dark:text-white/60">{label(task.taskType)}</TableCell>
              <TableCell>
                <Badge variant={task.priority === "HIGH" ? "danger" : task.priority === "MEDIUM" ? "warning" : "outline"}>{label(task.priority)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={task.isOverdue ? "danger" : task.status === "COMPLETED" ? "success" : "outline"}>
                  {task.isOverdue ? "Overdue" : label(task.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-black/60 dark:text-white/60">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</TableCell>
              <TableCell>{task.status !== "COMPLETED" && task.status !== "CANCELLED" && <CompleteTaskButton taskId={task.id} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function ContactTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    taskType?: string;
    status?: string;
    priority?: string;
    relatedRecordType?: string;
    assignedToUserId?: string;
    page?: string;
  }>;
}) {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);
  const params = await searchParams;
  const session = await auth();

  const [{ tasks: filteredTasks, total, page, totalPages }, myTasks, overdueTasks, members] = await Promise.all([
    listContactTasks(active.workspace.id, {
      taskType: params.taskType,
      status: params.status,
      priority: params.priority,
      relatedRecordType: params.relatedRecordType,
      assignedToUserId: params.assignedToUserId,
      page: Number(params.page) || 1,
    }),
    session?.user?.id ? listMyContactTasks(active.workspace.id, session.user.id) : Promise.resolve([]),
    getOverdueContactTasks(active.workspace.id),
    listActiveWorkspaceMembers(active.workspace.id),
  ]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openTasks = filteredTasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const dueToday = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= startOfToday && new Date(t.dueDate) < endOfToday);
  const dueThisWeek = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= endOfToday && new Date(t.dueDate) < endOfWeek);
  const recentlyCompleted = filteredTasks.filter((t) => t.status === "COMPLETED").sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  const allContactIds = [...filteredTasks, ...myTasks, ...overdueTasks].map((t) => t.contactId).filter((id): id is string => Boolean(id));
  const contactNames = await getContactNamesByIds(active.workspace.id, allContactIds);

  function pageHref(nextPage: number) {
    const qs = new URLSearchParams({
      ...(params.taskType ? { taskType: params.taskType } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.relatedRecordType ? { relatedRecordType: params.relatedRecordType } : {}),
      ...(params.assignedToUserId ? { assignedToUserId: params.assignedToUserId } : {}),
      page: String(nextPage),
    });
    return `/dashboard/contact-tasks?${qs.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Contact Tasks"
        description="Follow-up and CRM action items for your contacts — calls, emails, verification, and outreach next steps. Purely an in-app to-do list; nothing here sends reminders or emails on its own."
        action={
          <div className="flex items-center gap-2">
            <ExportCsvLink href="/api/export/contact-tasks" />
            {canManage && <GenerateRecommendedTasksButton />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="My open tasks" value={myTasks.length} />
        <StatCard label="Overdue tasks" value={overdueTasks.length} />
        <StatCard label="Due today" value={dueToday.length} />
        <StatCard label="Due this week" value={dueThisWeek.length} />
      </div>

      {canManage && (
        <div className="mb-6">
          <CreateContactTaskForm />
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">My open tasks</h2>
        <TaskTable tasks={myTasks} contactNames={contactNames} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Overdue tasks</h2>
        <TaskTable tasks={overdueTasks} contactNames={contactNames} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">All tasks</h2>
        <form className="mb-3 flex flex-wrap items-end gap-3" action="/dashboard/contact-tasks">
          <Select name="taskType" defaultValue={params.taskType ?? ""} className="w-auto">
            <option value="">All types</option>
            {["CALL", "EMAIL", "FOLLOW_UP", "VERIFY", "FIND_EMAIL", "FIND_PHONE", "LINK_OPPORTUNITY", "REVIEW", "OTHER"].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={params.status ?? ""} className="w-auto">
            <option value="">All statuses</option>
            {["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={params.priority ?? ""} className="w-auto">
            <option value="">All priorities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Select name="relatedRecordType" defaultValue={params.relatedRecordType ?? ""} className="w-auto">
            <option value="">All related record types</option>
            <option value="TARGET_CUSTOMER">Target Customer</option>
            <option value="PROJECT_OPPORTUNITY">Project Opportunity</option>
            <option value="TENDER_BUYER">Tender Buyer</option>
            <option value="TENDER_OPPORTUNITY">Tender Opportunity</option>
            <option value="VENDOR_REGISTRATION">Vendor Registration</option>
          </Select>
          {members.length > 0 && (
            <Select name="assignedToUserId" defaultValue={params.assignedToUserId ?? ""} className="w-auto">
              <option value="">Assigned to: anyone</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
            </Select>
          )}
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>

        {filteredTasks.length === 0 ? (
          <EmptyState title="No tasks match your filters" />
        ) : (
          <>
            <TaskTable tasks={filteredTasks} contactNames={contactNames} />
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-black/50 dark:text-white/50">
                  Page {page} of {totalPages} ({total} total)
                </span>
                <div className="flex items-center gap-2">
                  <a href={pageHref(page - 1)} className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
                    <Button type="button" variant="outline" size="sm">
                      Previous
                    </Button>
                  </a>
                  <a href={pageHref(page + 1)} className={page >= totalPages ? "pointer-events-none opacity-40" : ""}>
                    <Button type="button" variant="outline" size="sm">
                      Next
                    </Button>
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recently completed</h2>
        <TaskTable tasks={recentlyCompleted.slice(0, 20)} contactNames={contactNames} />
      </section>
    </div>
  );
}
