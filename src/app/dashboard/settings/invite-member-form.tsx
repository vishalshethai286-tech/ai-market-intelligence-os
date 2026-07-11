"use client";

import { useActionState } from "react";
import { inviteMember } from "@/lib/actions/workspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(inviteMember, undefined);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select id="invite-role" name="role" defaultValue="USER">
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="USER">User</option>
            <option value="VIEWER">Viewer</option>
          </Select>
        </div>
      </div>

      <FieldError>{state?.errors?.email}</FieldError>
      {state?.message && (
        <p className="text-sm text-black/60 dark:text-white/60">{state.message}</p>
      )}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
