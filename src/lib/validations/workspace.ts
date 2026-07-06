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
  email: z.email({ error: "Please enter a valid email." }).trim().toLowerCase(),
  role: z.enum([ROLES.ADMIN, ROLES.SALES_USER, ROLES.VIEWER], {
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
