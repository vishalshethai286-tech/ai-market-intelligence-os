import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { WebsiteAnalysis } from "@/models";
import { analyzeWebsite, fetchAndStorePageSnapshots } from "@/lib/website-analyzer";
import { REANALYSIS_COOLDOWN_MS } from "@/lib/website-analyzer/constants";

/** Prevents spamming re-analysis of the same workspace in quick succession. */
export async function canStartNewAnalysis(workspaceId: string): Promise<boolean> {
  await dbConnect();
  const latest = await WebsiteAnalysis.findOne({ workspaceId }, { createdAt: 1, status: 1 }).sort({
    createdAt: -1,
  });
  if (!latest) return true;
  if (latest.status === "RUNNING") return false;
  return Date.now() - latest.createdAt.getTime() > REANALYSIS_COOLDOWN_MS;
}

export async function getLatestAnalysis(workspaceId: string) {
  await dbConnect();
  return WebsiteAnalysis.findOne({ workspaceId }).sort({ createdAt: -1 });
}

/**
 * Runs the website analyzer for a workspace and persists the result — a
 * fresh row per run, kept as history. Never throws: failures are stored as
 * a FAILED row (with `error` set) rather than propagated, since this is
 * best-effort enrichment, not a blocking step.
 */
export async function runAndStoreWebsiteAnalysis(workspaceId: string, url: string) {
  await dbConnect();
  const analysis = await WebsiteAnalysis.create({ workspaceId, url, status: "RUNNING" });

  const result = await analyzeWebsite(url);
  const rawResult = result as unknown;

  if (!result.ok) {
    return WebsiteAnalysis.findByIdAndUpdate(
      analysis.id,
      {
        status: "FAILED",
        error: result.error,
        robotsAllowed: result.robotsAllowed,
        httpStatus: result.httpStatus,
        fetchedAt: new Date(),
        rawResult,
      },
      { new: true },
    );
  }

  const updated = await WebsiteAnalysis.findByIdAndUpdate(
    analysis.id,
    {
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
    { new: true },
  );

  try {
    await fetchAndStorePageSnapshots(
      workspaceId,
      analysis.id,
      {
        url: result.finalUrl,
        title: result.title,
        metaDescription: result.metaDescription,
        visibleText: result.visibleText,
        httpStatus: result.httpStatus,
      },
      result.identifiedPages,
    );
  } catch {
    // Snapshot storage is best-effort enrichment for downstream discovery —
    // never fail the analysis itself over it.
  }

  return updated;
}
