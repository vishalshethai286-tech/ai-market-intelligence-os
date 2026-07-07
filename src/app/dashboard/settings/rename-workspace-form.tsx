"use client";

import { useActionState } from "react";
import { renameWorkspace } from "@/lib/actions/workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function RenameWorkspaceForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(renameWorkspace, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <div className="flex max-w-sm gap-2">
        <Input name="name" defaultValue={currentName} required className="flex-1" />
        <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
      <FieldError>{state?.errors?.name}</FieldError>
      {state?.message && (
        <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
      )}
    </form>
  );
}
