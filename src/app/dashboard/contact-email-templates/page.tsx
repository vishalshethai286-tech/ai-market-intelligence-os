import type { Metadata } from "next";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { listContactEmailTemplates, seedDefaultContactEmailTemplates } from "@/lib/contacts/email-drafts";
import { PageHeader } from "@/components/ui/page-header";
import { ExportCsvLink } from "@/components/ui/export-csv-link";
import { EmailTemplatesManager } from "@/components/contacts/email-templates-manager";

export const metadata: Metadata = { title: "Email Templates" };

export default async function ContactEmailTemplatesPage() {
  const active = await requireActiveWorkspace();
  const canManage = canManageDiscovery(active.role);

  await seedDefaultContactEmailTemplates(active.workspace.id);
  const templates = await listContactEmailTemplates(active.workspace.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Email Templates"
        description="Editable draft templates for contact outreach. These only generate text inside the app — nothing here sends an email or connects to your email account."
        action={<ExportCsvLink href="/api/export/contact-email-templates" />}
      />

      {canManage ? (
        <EmailTemplatesManager templates={templates} />
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">Ask an owner, admin, manager, or user to manage email templates.</p>
      )}
    </div>
  );
}
