import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { ContactForm } from "@/components/contacts/contact-form";
import type { RelatedRecordType } from "@/lib/contacts/service";

export const metadata: Metadata = { title: "Add Contact" };

const VALID_RELATED_RECORD_TYPES: readonly string[] = [
  "TARGET_CUSTOMER",
  "PROJECT_OPPORTUNITY",
  "TENDER_BUYER",
  "TENDER_OPPORTUNITY",
  "VENDOR_REGISTRATION",
];

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ relatedRecordType?: string; relatedRecordId?: string }>;
}) {
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) redirect("/dashboard/contacts");

  const params = await searchParams;
  const prelinkRecordType =
    params.relatedRecordType && VALID_RELATED_RECORD_TYPES.includes(params.relatedRecordType)
      ? (params.relatedRecordType as RelatedRecordType)
      : undefined;
  const prelinkRecordId = prelinkRecordType ? params.relatedRecordId : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/contacts" className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to Contacts
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">Add Contact</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Role category and seniority are inferred from the designation unless you set them explicitly. If a matching contact already
        exists in this workspace (same email, LinkedIn, or name + company domain), it will be updated instead of duplicated.
      </p>

      <div className="mt-6">
        <ContactForm prelinkRecordType={prelinkRecordType} prelinkRecordId={prelinkRecordId} />
      </div>
    </div>
  );
}
