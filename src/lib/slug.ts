import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Appends a numeric suffix until the slug is unique among Workspaces. Pass
 * a transaction client to keep this on the same connection/transaction as
 * the rest of a workspace-creation flow.
 */
export async function uniqueWorkspaceSlug(
  base: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let suffix = 1;

  while (await client.workspace.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}
