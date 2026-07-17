import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { WebsitePageSnapshot } from "@/models";
import { assertSafeHttpUrl } from "./ssrf-guard";
import { safeFetchText } from "./safe-fetch";
import { isAllowedByRobots } from "./robots";
import { parseHomepage } from "./parse";
import { MAX_HOMEPAGE_BYTES, MAX_PAGE_SNAPSHOTS, MAX_SNAPSHOT_TEXT_LENGTH, SNAPSHOT_FETCH_CATEGORIES } from "./constants";
import type { PageCategory } from "./classify";
import type { ParsedLink } from "./parse";

type IdentifiedPages = Partial<Record<PageCategory, ParsedLink[]>>;

type HomepageSnapshot = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  visibleText: string;
  httpStatus: number;
};

/**
 * Persists one WebsitePageSnapshot per page fetched for a WebsiteAnalysis
 * run: the homepage (from already-fetched data — no extra request) plus a
 * bounded set of identified product/service/catalog/applications/downloads
 * pages, each fetched at most once. Reuses the same SSRF guard, robots.txt
 * check, and safe fetch as the homepage analysis — one request per page, no
 * recursion. A page that fails any check is skipped, not fatal to the run.
 *
 * Called once per analysis run (see src/lib/website-analysis.ts). Downstream
 * consumers (product/service discovery) read these snapshots back instead of
 * re-fetching the target site on every regenerate — see
 * src/lib/product-discovery/service.ts.
 */
export async function fetchAndStorePageSnapshots(
  workspaceId: string,
  websiteAnalysisId: string,
  homepage: HomepageSnapshot,
  identifiedPages: IdentifiedPages,
): Promise<void> {
  await dbConnect();
  await WebsitePageSnapshot.findOneAndUpdate(
    { websiteAnalysisId, url: homepage.url },
    {
      $setOnInsert: {
        workspaceId,
        websiteAnalysisId,
        url: homepage.url,
        category: null,
        title: homepage.title,
        visibleText: homepage.visibleText.slice(0, MAX_SNAPSHOT_TEXT_LENGTH),
        httpStatus: homepage.httpStatus,
      },
    },
    { upsert: true },
  );

  const candidates: Array<{ url: string; category: PageCategory }> = [];
  const seen = new Set<string>([homepage.url]);
  for (const category of SNAPSHOT_FETCH_CATEGORIES) {
    for (const link of identifiedPages[category] ?? []) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      candidates.push({ url: link.href, category });
      if (candidates.length >= MAX_PAGE_SNAPSHOTS) break;
    }
    if (candidates.length >= MAX_PAGE_SNAPSHOTS) break;
  }

  for (const candidate of candidates) {
    try {
      const parsedUrl = await assertSafeHttpUrl(candidate.url);
      const allowed = await isAllowedByRobots(parsedUrl.origin, parsedUrl.pathname);
      if (!allowed) continue;

      const result = await safeFetchText(candidate.url, MAX_HOMEPAGE_BYTES);
      if (result.status >= 400) continue;

      const parsed = parseHomepage(result.body, result.finalUrl);

      await WebsitePageSnapshot.findOneAndUpdate(
        { websiteAnalysisId, url: result.finalUrl },
        {
          $setOnInsert: {
            workspaceId,
            websiteAnalysisId,
            url: result.finalUrl,
            category: candidate.category,
            title: parsed.title,
            visibleText: parsed.visibleText.slice(0, MAX_SNAPSHOT_TEXT_LENGTH),
            httpStatus: result.status,
          },
        },
        { upsert: true },
      );
    } catch {
      // One bad page (blocked, timed out, non-2xx, SSRF-rejected) never fails the whole run.
      continue;
    }
  }
}

/** Reads back the snapshots stored for an analysis run — homepage first, then the rest in fetch order. */
export async function listPageSnapshots(websiteAnalysisId: string) {
  await dbConnect();
  return WebsitePageSnapshot.find({ websiteAnalysisId }).sort({ createdAt: 1 });
}
