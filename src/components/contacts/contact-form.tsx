"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Contact, ContactRoleCategory, ContactSeniority, ContactStatus, ContactSourceType } from "@/models";
import { createContactAction, updateContactAction, linkContactAction } from "@/lib/actions/contacts";
import type { RelatedRecordType } from "@/lib/contacts/service";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

// Hardcoded (not imported from "@/models") — that module also exports the Mongoose model itself, and importing any named export from it into a "use client" component would pull mongoose/mongodb into the browser bundle. Keep these lists in sync with src/models/Contact.ts.
const ROLE_CATEGORY_OPTIONS: ContactRoleCategory[] = [
  "PROCUREMENT",
  "PURCHASE",
  "SOURCING",
  "SUPPLY_CHAIN",
  "VENDOR_MANAGEMENT",
  "PROJECT_MANAGEMENT",
  "ENGINEERING",
  "MAINTENANCE",
  "PLANT_OPERATIONS",
  "OPERATIONS",
  "COMMERCIAL",
  "CONTRACTS",
  "TENDERING",
  "QUALITY",
  "TECHNICAL",
  "MANAGEMENT",
  "FINANCE",
  "ADMINISTRATION",
  "OTHER",
];
const SENIORITY_OPTIONS: ContactSeniority[] = [
  "OWNER",
  "PRESIDENT",
  "CEO",
  "DIRECTOR",
  "VP",
  "HEAD",
  "MANAGER",
  "ENGINEER",
  "EXECUTIVE",
  "OFFICER",
  "COORDINATOR",
  "UNKNOWN",
];
const STATUS_OPTIONS: ContactStatus[] = [
  "NEW",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
  "CONTACTED",
  "RESPONDED",
  "FOLLOW_UP",
  "NOT_RELEVANT",
  "ARCHIVED",
];
const SOURCE_TYPE_OPTIONS: ContactSourceType[] = [
  "COMPANY_WEBSITE",
  "CONTACT_PAGE",
  "TEAM_PAGE",
  "PROCUREMENT_PAGE",
  "SUPPLIER_PORTAL",
  "TENDER_DOCUMENT",
  "PUBLIC_PDF",
  "PUBLIC_DIRECTORY",
  "PRESS_RELEASE",
  "CONFERENCE_PAGE",
  "MANUAL_ENTRY",
  "CSV_IMPORT",
  "OTHER",
];

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Reusable create/edit form for a Contact. In "create" mode it posts to
 * createContactAction (which may silently update a matching existing
 * contact instead of creating a duplicate — see contacts/service.ts) and
 * then navigates to the resulting contact's detail page; in "edit" mode it
 * posts to updateContactAction with the contact id as a hidden field and
 * just refreshes in place. roleCategory/seniority default to "" (Auto),
 * which tells the service layer to infer them from the designation.
 */
export function ContactForm({
  contact,
  prelinkRecordType,
  prelinkRecordId,
}: {
  contact?: Contact;
  /** When set (from a "Add Contact for this record" link on a Customer/Project/Tender/Vendor Registration detail page), the newly-created contact is linked to this record before redirecting. */
  prelinkRecordType?: RelatedRecordType;
  prelinkRecordId?: string;
}) {
  const mode = contact ? "edit" : "create";
  const [state, action, pending] = useActionState(mode === "edit" ? updateContactAction : createContactAction, undefined);
  const router = useRouter();

  useEffect(() => {
    if (!state?.contactId || state.errors) return;
    if (mode === "create") {
      (async () => {
        if (prelinkRecordType && prelinkRecordId) {
          await linkContactAction(state.contactId as string, prelinkRecordType, prelinkRecordId);
        }
        router.push(`/dashboard/contacts/${state.contactId}`);
      })();
    } else {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5">
      {mode === "edit" && contact && <input type="hidden" name="contactId" value={contact.id} />}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="fullName">Full Name</Label>
          <Input id="fullName" name="fullName" required defaultValue={contact?.fullName ?? ""} className="mt-1" />
          <FieldError>{state?.errors?.fullName}</FieldError>
        </div>
        <div>
          <Label htmlFor="companyName">Company</Label>
          <Input id="companyName" name="companyName" defaultValue={contact?.companyName ?? ""} className="mt-1" />
          <FieldError>{state?.errors?.companyName}</FieldError>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="companyWebsite">Website</Label>
          <Input id="companyWebsite" name="companyWebsite" defaultValue={contact?.companyWebsite ?? ""} className="mt-1" />
          <FieldError>{state?.errors?.companyWebsite}</FieldError>
        </div>
        <div>
          <Label htmlFor="designation">Designation</Label>
          <Input id="designation" name="designation" defaultValue={contact?.designation ?? ""} placeholder="e.g. Procurement Manager" className="mt-1" />
          <FieldError>{state?.errors?.designation}</FieldError>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" defaultValue={contact?.department ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="roleCategory">Role Category</Label>
          <Select id="roleCategory" name="roleCategory" defaultValue={contact?.roleCategory ?? ""} className="mt-1">
            <option value="">Auto (from designation)</option>
            {ROLE_CATEGORY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="seniority">Seniority</Label>
          <Select id="seniority" name="seniority" defaultValue={contact?.seniority ?? ""} className="mt-1">
            <option value="">Auto (from designation)</option>
            {SENIORITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} className="mt-1" />
          <FieldError>{state?.errors?.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input id="linkedinUrl" name="linkedinUrl" defaultValue={contact?.linkedinUrl ?? ""} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="phoneNumber">Phone</Label>
          <Input id="phoneNumber" name="phoneNumber" defaultValue={contact?.phoneNumber ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="mobileNumber">Mobile</Label>
          <Input id="mobileNumber" name="mobileNumber" defaultValue={contact?.mobileNumber ?? ""} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={contact?.country ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={contact?.location ?? ""} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={contact?.status ?? "NEW"} className="mt-1">
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sourceType">Source Type</Label>
          <Select id="sourceType" name="sourceType" defaultValue={contact?.sourceType ?? "MANUAL_ENTRY"} className="mt-1">
            {SOURCE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sourceUrl">Source URL</Label>
          <Input id="sourceUrl" name="sourceUrl" defaultValue={contact?.sourceUrl ?? ""} className="mt-1" />
        </div>
      </div>

      <div>
        <Label htmlFor="tags">Tags</Label>
        <Input id="tags" name="tags" defaultValue={contact?.tags.join(", ") ?? ""} placeholder="Comma-separated" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={contact?.notes ?? ""} className="mt-1" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : mode === "edit" ? "Save changes" : "Add Contact"}
        </Button>
        {state?.message && <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>}
      </div>
    </form>
  );
}
