import { prisma } from "@/lib/prisma";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Appends a numeric suffix until the slug is unique among Workspaces. */
export async function uniqueWorkspaceSlug(base: string): Promise<string> {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let suffix = 1;

  while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}
