"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/lib/actions/workspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" type="text" required placeholder="Acme Sales Team" />
        <FieldError>{state?.errors?.name}</FieldError>
      </div>

      <FieldError>{state?.message}</FieldError>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Creating..." : "Create workspace"}
      </Button>
    </form>
  );
}
