import {
  getBestContactsForTargetCustomer,
  getBestContactsForProject,
  getBestContactsForTenderBuyer,
  getBestContactsForTenderOpportunity,
  getBestContactsForVendorRegistration,
  getMissingContactRolesForEntity,
} from "@/lib/contacts/recommendations";
import { Badge } from "@/components/ui/badge";
import type { ContactLinkableRecordType } from "@/models";

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

const ENTITY_LABELS: Record<ContactLinkableRecordType, string> = {
  TARGET_CUSTOMER: "this customer",
  PROJECT_OPPORTUNITY: "this project",
  TENDER_BUYER: "this tender buyer",
  TENDER_OPPORTUNITY: "this tender",
  VENDOR_REGISTRATION: "this vendor registration",
};

/**
 * For each related record this contact is linked to, shows how it ranks
 * against other contacts linked to the same record and which recommended
 * roles still have no coverage — helps a user judge whether this contact is
 * really the best person to approach, or whether a better/different contact
 * is needed too.
 */
export async function ContactRecommendationsSection({
  workspaceId,
  currentContactId,
  relatedTargetCustomerId,
  relatedProjectOpportunityId,
  relatedTenderBuyerId,
  relatedTenderOpportunityId,
  relatedVendorRegistrationId,
}: {
  workspaceId: string;
  currentContactId: string;
  relatedTargetCustomerId: string | null;
  relatedProjectOpportunityId: string | null;
  relatedTenderBuyerId: string | null;
  relatedTenderOpportunityId: string | null;
  relatedVendorRegistrationId: string | null;
}) {
  const entries: { recordType: ContactLinkableRecordType; recordId: string }[] = [
    ...(relatedTargetCustomerId ? [{ recordType: "TARGET_CUSTOMER" as const, recordId: relatedTargetCustomerId }] : []),
    ...(relatedProjectOpportunityId ? [{ recordType: "PROJECT_OPPORTUNITY" as const, recordId: relatedProjectOpportunityId }] : []),
    ...(relatedTenderBuyerId ? [{ recordType: "TENDER_BUYER" as const, recordId: relatedTenderBuyerId }] : []),
    ...(relatedTenderOpportunityId ? [{ recordType: "TENDER_OPPORTUNITY" as const, recordId: relatedTenderOpportunityId }] : []),
    ...(relatedVendorRegistrationId ? [{ recordType: "VENDOR_REGISTRATION" as const, recordId: relatedVendorRegistrationId }] : []),
  ];

  if (entries.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">Not linked to any customer/project/tender/vendor registration yet.</p>;
  }

  const bestContactFns = {
    TARGET_CUSTOMER: getBestContactsForTargetCustomer,
    PROJECT_OPPORTUNITY: getBestContactsForProject,
    TENDER_BUYER: getBestContactsForTenderBuyer,
    TENDER_OPPORTUNITY: getBestContactsForTenderOpportunity,
    VENDOR_REGISTRATION: getBestContactsForVendorRegistration,
  } as const;

  const results = await Promise.all(
    entries.map(async (entry) => {
      const [best, missingRoles] = await Promise.all([
        bestContactFns[entry.recordType](workspaceId, entry.recordId),
        getMissingContactRolesForEntity(workspaceId, entry.recordType, entry.recordId),
      ]);
      return { ...entry, best, missingRoles };
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      {results.map((result) => (
        <div key={`${result.recordType}-${result.recordId}`} className="rounded-lg border border-black/[.08] p-3 text-sm dark:border-white/[.145]">
          <p className="font-medium">Best contacts for {ENTITY_LABELS[result.recordType]}</p>
          {result.best.alert && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{result.best.alert}</p>}
          {result.best.contacts.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {result.best.contacts.slice(0, 3).map((ranked) => (
                <li key={ranked.contact.id} className="flex items-center gap-2">
                  <span className={ranked.contact.id === currentContactId ? "font-medium" : ""}>
                    {ranked.contact.fullName}
                    {ranked.contact.id === currentContactId ? " (this contact)" : ""}
                  </span>
                  <Badge variant="outline">{label(ranked.contact.roleCategory)}</Badge>
                  <span className="text-xs text-black/50 dark:text-white/50">score {ranked.rankScore}</span>
                </li>
              ))}
            </ul>
          )}
          {result.missingRoles.length > 0 && (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">Missing roles: {result.missingRoles.map(label).join(", ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}
