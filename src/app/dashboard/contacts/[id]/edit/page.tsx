import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canManageDiscovery } from "@/lib/access-control";
import { getContactById, ContactNotFoundError } from "@/lib/contacts/service";
import { ContactForm } from "@/components/contacts/contact-form";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveWorkspace();
  if (!canManageDiscovery(active.role)) redirect(`/dashboard/contacts/${id}`);

  let contact;
  try {
    contact = await getContactById(active.workspace.id, id);
  } catch (error) {
    if (error instanceof ContactNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/contacts/${contact.id}`} className="text-sm text-black/50 underline-offset-2 hover:underline dark:text-white/50">
        &larr; Back to {contact.fullName}
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">Edit Contact</h1>

      <div className="mt-6">
        <ContactForm contact={contact} />
      </div>
    </div>
  );
}
