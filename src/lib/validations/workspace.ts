import * as z from "zod";
import { ROLES } from "@/lib/access-control";

export const WorkspaceNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Workspace name must be at least 2 characters." })
    .max(64, { error: "Workspace name must be at most 64 characters." }),
});

export const InviteMemberSchema = z.object({
  // Trim/lowercase before validating format — a raw z.email().trim() would
  // reject a value with incidental leading/trailing whitespace, since the
  // format check runs before the trim in declaration order.
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Please enter a valid email." })),
  role: z.enum([ROLES.ADMIN, ROLES.MANAGER, ROLES.USER, ROLES.VIEWER], {
    error: "Please choose a role.",
  }),
});

export type WorkspaceNameFormState =
  | {
      errors?: { name?: string[] };
      message?: string;
    }
  | undefined;

export type InviteMemberFormState =
  | {
      errors?: { email?: string[]; role?: string[] };
      message?: string;
    }
  | undefined;
