import * as z from "zod";

export const SignupSchema = z.object({
  name: z.string().trim().min(2, { error: "Name must be at least 2 characters." }),
  // Trim/lowercase before validating format — a raw z.email().trim() would
  // reject a value with incidental leading/trailing whitespace, since the
  // format check runs before the trim in declaration order.
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Please enter a valid email." })),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Password must contain at least one letter." })
    .regex(/[0-9]/, { error: "Password must contain at least one number." }),
});

export const LoginSchema = z.object({
  // Trim/lowercase before validating format — a raw z.email().trim() would
  // reject a value with incidental leading/trailing whitespace, since the
  // format check runs before the trim in declaration order.
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Please enter a valid email." })),
  password: z.string().min(1, { error: "Password is required." }),
});

export const NewPasswordSchema = z.object({
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Password must contain at least one letter." })
    .regex(/[0-9]/, { error: "Password must contain at least one number." }),
});

export type SignupFormState =
  | {
      errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

export type LoginFormState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;
