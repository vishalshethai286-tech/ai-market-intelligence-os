"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createContactEmailTemplateAction,
  updateContactEmailTemplateAction,
  deleteContactEmailTemplateAction,
} from "@/lib/actions/contact-email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ContactEmailTemplate, ContactEmailTemplateType } from "@/models";

const TEMPLATE_TYPE_OPTIONS: ContactEmailTemplateType[] = [
  "INTRODUCTION",
  "VENDOR_REGISTRATION",
  "TENDER_FOLLOW_UP",
  "PROJECT_OPPORTUNITY",
  "PRODUCT_INTRODUCTION",
  "CAPABILITY_STATEMENT",
  "MEETING_REQUEST",
  "FOLLOW_UP",
  "CUSTOM",
];

const SAMPLE_VALUES: Record<string, string> = {
  contactName: "Jane Smith",
  companyName: "Acme Industrial Pumps",
  designation: "Procurement Manager",
  ourCompanyName: "Your Company",
  productService: "Centrifugal Pumps",
  matchedOpportunity: "New Pump Station Project",
  country: "United Arab Emirates",
  sourceContext: " (found via acmepumps.example.com/procurement)",
};

function fillSample(text: string): string {
  return Object.entries(SAMPLE_VALUES).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), text);
}

function label(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

type FormState = { name: string; templateType: ContactEmailTemplateType; subject: string; body: string; productServiceContext: string };

const EMPTY_FORM: FormState = { name: "", templateType: "CUSTOM", subject: "", body: "", productServiceContext: "" };

function TemplateForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial: FormState;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="templateType">Type</Label>
          <Select id="templateType" className="mt-1 w-auto" value={form.templateType} onChange={(e) => setForm({ ...form, templateType: e.target.value as ContactEmailTemplateType })}>
            {TEMPLATE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="productServiceContext">Product/service context (optional)</Label>
          <Input id="productServiceContext" className="mt-1" value={form.productServiceContext} onChange={(e) => setForm({ ...form, productServiceContext: e.target.value })} />
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" className="mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="body">Body</Label>
        <Textarea id="body" className="mt-1" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Placeholders: {"{{contactName}} {{companyName}} {{designation}} {{ourCompanyName}} {{productService}} {{matchedOpportunity}} {{country}} {{sourceContext}}"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => onSubmit(form)}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function EmailTemplatesManager({ templates }: { templates: ContactEmailTemplate[] }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleCreate(form: FormState) {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    startTransition(async () => {
      setError(null);
      const result = await createContactEmailTemplateAction({
        name: form.name,
        templateType: form.templateType,
        subject: form.subject,
        body: form.body,
        productServiceContext: form.productServiceContext || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreating(false);
      router.refresh();
    });
  }

  function handleUpdate(id: string, form: FormState) {
    startTransition(async () => {
      setError(null);
      const result = await updateContactEmailTemplateAction(id, {
        name: form.name,
        templateType: form.templateType,
        subject: form.subject,
        body: form.body,
        productServiceContext: form.productServiceContext || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await deleteContactEmailTemplateAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/60 dark:text-white/60">{templates.length} template{templates.length === 1 ? "" : "s"}</p>
        {!creating && (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            New Template
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {creating && (
        <TemplateForm initial={EMPTY_FORM} isPending={isPending} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      )}

      <div className="flex flex-col gap-3">
        {templates.map((template) =>
          editingId === template.id ? (
            <TemplateForm
              key={template.id}
              initial={{
                name: template.name,
                templateType: template.templateType,
                subject: template.subject,
                body: template.body,
                productServiceContext: template.productServiceContext ?? "",
              }}
              isPending={isPending}
              onSubmit={(form) => handleUpdate(template.id, form)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={template.id} className="rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{template.name}</span>
                  <Badge variant="outline" className="ml-2">
                    {label(template.templateType)}
                  </Badge>
                  {template.isDefault && (
                    <Badge variant="outline" className="ml-2">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPreviewId(previewId === template.id ? null : template.id)}>
                    {previewId === template.id ? "Hide Preview" : "Preview"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(template.id)}>
                    Edit
                  </Button>
                  {!template.isDefault && (
                    <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => handleDelete(template.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 truncate text-sm text-black/60 dark:text-white/60">{template.subject}</p>
              {previewId === template.id && (
                <div className="mt-3 rounded-lg bg-black/[.03] p-3 text-sm dark:bg-white/[.06]">
                  <p className="font-medium">{fillSample(template.subject)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-black/70 dark:text-white/70">{fillSample(template.body)}</p>
                  <p className="mt-2 text-xs text-black/50 dark:text-white/50">Preview with sample contact data — not a real contact.</p>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
