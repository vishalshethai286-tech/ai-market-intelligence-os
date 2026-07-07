import "server-only";
import { prisma } from "@/lib/prisma";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { REANALYSIS_COOLDOWN_MS } from "@/lib/website-analyzer/constants";
import type { Prisma } from "@/generated/prisma/client";

/** Prevents spamming re-analysis of the same workspace in quick succession. */
export async function canStartNewAnalysis(workspaceId: string): Promise<boolean> {
  const latest = await prisma.websiteAnalysis.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true },
  });
  if (!latest) return true;
  if (latest.status === "RUNNING") return false;
  return Date.now() - latest.createdAt.getTime() > REANALYSIS_COOLDOWN_MS;
}

export function getLatestAnalysis(workspaceId: string) {
  return prisma.websiteAnalysis.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Runs the website analyzer for a workspace and persists the result — a
 * fresh row per run, kept as history. Never throws: failures are stored as
 * a FAILED row (with `error` set) rather than propagated, since this is
 * best-effort enrichment, not a blocking step.
 */
export async function runAndStoreWebsiteAnalysis(workspaceId: string, url: string) {
  const analysis = await prisma.websiteAnalysis.create({
    data: { workspaceId, url, status: "RUNNING" },
  });

  const result = await analyzeWebsite(url);
  const rawResult = result as unknown as Prisma.InputJsonValue;

  if (!result.ok) {
    return prisma.websiteAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "FAILED",
        error: result.error,
        robotsAllowed: result.robotsAllowed,
        httpStatus: result.httpStatus,
        fetchedAt: new Date(),
        rawResult,
      },
    });
  }

  return prisma.websiteAnalysis.update({
    where: { id: analysis.id },
    data: {
      status: "COMPLETED",
      httpStatus: result.httpStatus,
      robotsAllowed: result.robotsAllowed,
      title: result.title,
      metaDescription: result.metaDescription,
      headings: result.headings,
      visibleText: result.visibleText,
      internalLinks: result.internalLinks,
      identifiedPages: result.identifiedPages,
      rawResult,
      fetchedAt: new Date(),
    },
  });
}
