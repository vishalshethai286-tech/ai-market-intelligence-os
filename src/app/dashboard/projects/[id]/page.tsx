import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { RelatedContactsSection } from "@/components/contacts/related-contacts-section";
import { getProject, ProjectNotFoundError } from "@/lib/projects/service";
import { countPendingDuplicatesForRecord, listFieldChangeHistory } from "@/lib/dedup/service";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { ProjectDetailActions } from "@/components/projects/project-detail-actions";

export const metadata: Metadata = { title: "Project detail" };

const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();

  let project;
  try {
    project = await getProject(active.workspace.id, id);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  }

  const [pendingDuplicates, fieldChanges] = await Promise.all([
    countPendingDuplicatesForRecord(active.workspace.id, "PROJECT", project.id),
    listFieldChangeHistory(active.workspace.id, "PROJECT", project.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/projects" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Projects
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.projectName}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {project.clientName} · {project.country ?? "Unknown country"}
            {project.duplicateStatus !== "UNIQUE" && ` · ${project.duplicateStatus.replace(/_/g, " ").toLowerCase()}`}
          </p>
        </div>
        <Badge>{project.status}</Badge>
      </div>

      {pendingDuplicates > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span>
            {pendingDuplicates} possible duplicate{pendingDuplicates === 1 ? "" : "s"} pending review.
          </span>
          <Link href="/dashboard/duplicates?status=PENDING_REVIEW&recordType=PROJECT" className="font-medium underline-offset-2 hover:underline">
            Review in Duplicates &rarr;
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Score" value={Math.round(project.score)} />
        <StatCard label="Priority" value={project.priority ? PRIORITY_LABEL[project.priority] : "—"} />
        <StatCard label="Confidence" value={`${Math.round(project.confidenceScore * 100)}%`} />
        <StatCard label="Sources" value={project.sourceHistory.length} />
      </div>

      {canManageDiscovery(active.role) && (
        <div className="mt-8">
          <ProjectDetailActions id={project.id} status={project.status} />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-black/[.08] p-4 sm:grid-cols-2 dark:border-white/[.145]">
        <Field label="Location" value={project.location} />
        <Field label="Country" value={project.country} />
        <Field label="Contractor name" value={project.contractorName} />
        <Field label="Timeline" value={project.timeline} />
        <Field label="Project stage" value={project.projectStage} />
        <Field label="Industry" value={project.industry} />
        <Field label="Matched product/service" value={project.matchedProductServiceName} />
        <Field label="Last verified" value={project.lastVerifiedAt ? new Date(project.lastVerifiedAt).toLocaleString() : null} />
        <Field label="Project information link" value={project.projectInformationLink} />
        <Field label="Source result" value={project.sourceUrl} />
      </dl>

      {project.aiOpportunityExplanation && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">AI opportunity explanation</h2>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">{project.aiOpportunityExplanation}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium">Source history ({project.sourceHistory.length})</h2>
        {project.sourceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">No sources recorded.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {project.sourceHistory.map((entry, index) => (
              <li key={`${entry.rawSearchResultId}-${index}`} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <a href={entry.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {entry.url}
                </a>
                <div className="mt-1 flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                  <span>{new Date(entry.retrievedAt).toLocaleString()}</span>
                  <Link href={`/dashboard/discovery-runs/${entry.discoveryRunId}`} className="underline-offset-2 hover:underline">
                    View discovery run
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {fieldChanges.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Field change history ({fieldChanges.length})</h2>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">Values updated by a deduplication merge, with the source that justified each change.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {fieldChanges.map((change) => (
              <li key={change.id} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{change.fieldName}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">{new Date(change.capturedAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                  {change.oldValue || "(empty)"} &rarr; {change.newValue || "(empty)"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RelatedContactsSection
        workspaceId={active.workspace.id}
        recordType="PROJECT_OPPORTUNITY"
        recordId={project.id}
        recordLabel={project.projectName}
        canManage={canManageDiscovery(active.role)}
      />
    </div>
  );
}
