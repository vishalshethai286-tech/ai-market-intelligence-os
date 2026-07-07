import "server-only";
import { assertSafeHttpUrl } from "@/lib/website-analyzer/ssrf-guard";
import { safeFetchText } from "@/lib/website-analyzer/safe-fetch";
import { isAllowedByRobots } from "@/lib/website-analyzer/robots";
import { parseHomepage } from "@/lib/website-analyzer/parse";
import { MAX_HOMEPAGE_BYTES } from "@/lib/website-analyzer/constants";
import type { PageCategory } from "@/lib/website-analyzer";
import { FETCH_CATEGORIES, MAX_ADDITIONAL_PAGES, MAX_PAGE_TEXT_LENGTH } from "./constants";

export type FetchedPage = { url: string; title: string | null; text: string };
type IdentifiedLink = { href: string; text: string };
type IdentifiedPages = Partial<Record<PageCategory, IdentifiedLink[]>>;

/**
 * Fetches a bounded set of product/service/catalog pages identified on the
 * homepage, beyond the homepage itself, so product/service extraction has
 * real per-page content instead of guessing everything from one page.
 * Reuses the website analyzer's SSRF guard, robots.txt check, and safe
 * fetch — same non-aggressive, single-request-per-page posture. A page that
 * fails any check is skipped rather than failing the whole run.
 */
export async function fetchAdditionalPages(
  homepageUrl: string,
  identifiedPages: IdentifiedPages,
): Promise<FetchedPage[]> {
  const candidateUrls: string[] = [];
  const seen = new Set<string>([homepageUrl]);
  for (const category of FETCH_CATEGORIES) {
    for (const link of identifiedPages[category] ?? []) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      candidateUrls.push(link.href);
      if (candidateUrls.length >= MAX_ADDITIONAL_PAGES) break;
    }
    if (candidateUrls.length >= MAX_ADDITIONAL_PAGES) break;
  }

  const pages: FetchedPage[] = [];
  for (const url of candidateUrls) {
    try {
      const parsedUrl = await assertSafeHttpUrl(url);
      const allowed = await isAllowedByRobots(parsedUrl.origin, parsedUrl.pathname);
      if (!allowed) continue;

      const result = await safeFetchText(url, MAX_HOMEPAGE_BYTES);
      if (result.status >= 400) continue;

      const parsed = parseHomepage(result.body, result.finalUrl);
      pages.push({
        url: result.finalUrl,
        title: parsed.title,
        text: parsed.visibleText.slice(0, MAX_PAGE_TEXT_LENGTH),
      });
    } catch {
      // One bad page (blocked, timed out, non-2xx) never fails the whole run.
      continue;
    }
  }

  return pages;
}
