"use client";

import { useState, useTransition } from "react";
import { generateContactEmailDraftAction, logContactEmailDraftAction } from "@/lib/actions/contact-email-templates";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type EmailTemplateOption = { id: string; name: string; templateType: string };

/**
 * Draft-only email generator for one contact — selects a template, fills
 * its placeholders from the contact/related entity/Business Brain, and
 * shows editable subject/body text. Nothing here sends an email; "Log as
 * activity" just records that a draft was prepared (outcome EMAIL_DRAFTED),
 * so the user still has to copy the text into their own email client.
 */
export function ContactEmailDraftPanel({ contactId, templates }: { contactId: string; templates: EmailTemplateOption[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [productService, setProductService] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function generate() {
    if (!templateId) return;
    startTransition(async () => {
      setMessage(null);
      const result = await generateContactEmailDraftAction({ contactId, templateId, productService: productService || undefined });
      if (!result.ok) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setIsError(false);
      setSubject(result.subject);
      setBody(result.body);
      setHasDraft(true);
    });
  }

  function logDraft() {
    startTransition(async () => {
      setMessage(null);
      const result = await logContactEmailDraftAction(contactId, subject, body);
      if (!result.ok) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setIsError(false);
      setMessage("Logged as an activity — remember to send it yourself from your own email client.");
    });
  }

  if (templates.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No email templates yet — create one on the Email Templates page.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="templateId">Template</Label>
          <Select id="templateId" className="mt-1 w-auto" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="productService">Product/service (optional)</Label>
          <Input id="productService" className="mt-1" value={productService} onChange={(e) => setProductService(e.target.value)} placeholder="e.g. Centrifugal Pumps" />
        </div>
        <Button type="button" size="sm" disabled={isPending} onClick={generate}>
          {isPending ? "Generating..." : "Generate Draft"}
        </Button>
      </div>

      {hasDraft && (
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="draftSubject">Subject</Label>
            <Input id="draftSubject" className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="draftBody">Body</Label>
            <Textarea id="draftBody" className="mt-1" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={logDraft}>
              Log as Activity
            </Button>
          </div>
        </div>
      )}

      {message && <p className={`text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>{message}</p>}
    </div>
  );
}
