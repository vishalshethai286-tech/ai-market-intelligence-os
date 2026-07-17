import Link from "next/link";
import { listContactsForRelatedRecord } from "@/lib/contacts/service";
import type { RelatedRecordType } from "@/lib/contacts/service";
import {
  getBestContactsForTargetCustomer,
  getBestContactsForProject,
  getBestContactsForTenderBuyer,
  getBestContactsForTenderOpportunity,
  getBestContactsForVendorRegistration,
  getMissingContactRolesForEntity,
} from "@/lib/contacts/recommendations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateEntityFollowUpTaskButton } from "@/components/contacts/create-entity-follow-up-task-button";

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

const PRIORITY_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" };

const BEST_CONTACT_FNS = {
  TARGET_CUSTOMER: getBestContactsForTargetCustomer,
  PROJECT_OPPORTUNITY: getBestContactsForProject,
  TENDER_BUYER: getBestContactsForTenderBuyer,
  TENDER_OPPORTUNITY: getBestContactsForTenderOpportunity,
  VENDOR_REGISTRATION: getBestContactsForVendorRegistration,
} as const;

/**
 * "Related Contacts" section for Customer/Project/Tender Buyer/Live
 * Tender/Vendor Registration detail pages — shows every Contact linked to
 * this record, a best-contact recommendation, any missing recommended
 * roles, and quick actions (Add Contact, Create Follow-up Task, and a link
 * to Contact Discovery for finding public contacts if none exist).
 */
export async function RelatedContactsSection({
  workspaceId,
  recordType,
  recordId,
  recordLabel,
  canManage,
}: {
  workspaceId: string;
  recordType: RelatedRecordType;
  recordId: string;
  recordLabel: string;
  canManage: boolean;
}) {
  const [contacts, best, missingRoles] = await Promise.all([
    listContactsForRelatedRecord(workspaceId, recordType, recordId),
    BEST_CONTACT_FNS[recordType](workspaceId, recordId),
    getMissingContactRolesForEntity(workspaceId, recordType, recordId),
  ]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Related Contacts ({contacts.length})</h2>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/contacts/new?relatedRecordType=${recordType}&relatedRecordId=${recordId}`}>
              <Button type="button" variant="outline" size="sm">
                Add Contact for this record
              </Button>
            </Link>
            <Link href="/dashboard/contact-discovery">
              <Button type="button" variant="outline" size="sm">
                Discover Public Contacts
              </Button>
            </Link>
            <CreateEntityFollowUpTaskButton recordType={recordType} recordId={recordId} recordLabel={recordLabel} />
          </div>
        )}
      </div>

      {best.alert && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{best.alert}</p>
      )}
      {best.contacts.length > 0 && !best.alert && (
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          Best contact: <span className="font-medium text-foreground">{best.contacts[0].contact.fullName}</span> ({label(best.contacts[0].contact.roleCategory)})
        </p>
      )}
      {missingRoles.length > 0 && (
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">Missing recommended roles: {missingRoles.map(label).join(", ")}</p>
      )}

      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-black/50 dark:text-white/50">No contacts linked to this record yet.</p>
      ) : (
        <div className="mt-3 rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link href={`/dashboard/contacts/${contact.id}`} className="font-medium underline-offset-2 hover:underline">
                      {contact.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.designation ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.email ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{contact.phoneNumber ?? "—"}</TableCell>
                  <TableCell className="text-black/60 dark:text-white/60">{label(contact.roleCategory)}</TableCell>
                  <TableCell>{contact.priority ? <Badge variant="outline">{PRIORITY_LABEL[contact.priority]}</Badge> : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{label(contact.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
