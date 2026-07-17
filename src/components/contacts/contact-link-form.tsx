"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkContactAction } from "@/lib/actions/contacts";
import type { RelatedRecordType } from "@/lib/contacts/service";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const RECORD_TYPE_OPTIONS: { value: RelatedRecordType; label: string }[] = [
  { value: "TARGET_CUSTOMER", label: "Target Customer" },
  { value: "PROJECT_OPPORTUNITY", label: "Project" },
  { value: "TENDER_BUYER", label: "Tender Buyer" },
  { value: "TENDER_OPPORTUNITY", label: "Live Tender" },
  { value: "VENDOR_REGISTRATION", label: "Vendor Registration" },
];

/** Links this contact to a record by id — the id has to be copied from that record's own detail page URL for now (no search picker yet, consistent with this phase's manual/linking-only scope). */
export function ContactLinkForm({ contactId }: { contactId: string }) {
  const [recordType, setRecordType] = useState<RelatedRecordType>("TARGET_CUSTOMER");
  const [recordId, setRecordId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recordId.trim()) return;
    startTransition(async () => {
      setError(null);
      const result = await linkContactAction(contactId, recordType, recordId.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecordId("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <Select className="w-auto" value={recordType} onChange={(e) => setRecordType(e.target.value as RelatedRecordType)}>
          {RECORD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <Input placeholder="Record id" value={recordId} onChange={(e) => setRecordId(e.target.value)} className="w-56" />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Linking..." : "Link"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
