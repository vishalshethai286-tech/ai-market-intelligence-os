import "server-only";
import { assertSafeHttpUrl, UnsafeUrlError } from "./ssrf-guard";
import { safeFetchText, FetchError } from "./safe-fetch";
import { isAllowedByRobots } from "./robots";
import { parseHomepage, type ParsedLink, type ParsedHomepage } from "./parse";
import { classifyLinks, type PageCategory } from "./classify";
import { MAX_HOMEPAGE_BYTES } from "./constants";

export type WebsiteAnalysisResult =
  | {
      ok: true;
      finalUrl: string;
      httpStatus: number;
      robotsAllowed: true;
      title: string | null;
      metaDescription: string | null;
      headings: ParsedHomepage["headings"];
      visibleText: string;
      internalLinks: ParsedLink[];
      identifiedPages: Record<PageCategory, ParsedLink[]>;
    }
  | {
      ok: false;
      reason: "unsafe_url" | "robots_disallowed" | "fetch_failed" | "http_error";
      robotsAllowed: boolean | null;
      httpStatus?: number;
      error: string;
    };

/**
 * Fetches and analyzes a single homepage. Never throws — every failure mode
 * (unsafe URL, robots.txt disallow, network error, non-2xx response) comes
 * back as `{ ok: false, reason, error }` so callers don't need to know about
 * this module's internal error classes.
 *
 * Deliberately does not crawl: it only ever requests the one URL passed in.
 */
export async function analyzeWebsite(rawUrl: string): Promise<WebsiteAnalysisResult> {
  let url: URL;
  try {
    url = await assertSafeHttpUrl(rawUrl);
  } catch (error) {
    const message = error instanceof UnsafeUrlError ? error.message : "That URL isn't allowed.";
    return { ok: false, reason: "unsafe_url", robotsAllowed: null, error: message };
  }

  const robotsAllowed = await isAllowedByRobots(url.origin, url.pathname);
  if (!robotsAllowed) {
    return {
      ok: false,
      reason: "robots_disallowed",
      robotsAllowed: false,
      error: "This site's robots.txt disallows automated access to this page.",
    };
  }

  let fetchResult;
  try {
    fetchResult = await safeFetchText(url.toString(), MAX_HOMEPAGE_BYTES);
  } catch (error) {
    const message = error instanceof FetchError ? error.message : "Could not fetch that website.";
    return { ok: false, reason: "fetch_failed", robotsAllowed: true, error: message };
  }

  if (fetchResult.status >= 400) {
    return {
      ok: false,
      reason: "http_error",
      robotsAllowed: true,
      httpStatus: fetchResult.status,
      error: `The site responded with HTTP ${fetchResult.status}.`,
    };
  }

  const parsed = parseHomepage(fetchResult.body, fetchResult.finalUrl);
  const identifiedPages = classifyLinks(parsed.internalLinks);

  return {
    ok: true,
    finalUrl: fetchResult.finalUrl,
    httpStatus: fetchResult.status,
    robotsAllowed: true,
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    headings: parsed.headings,
    visibleText: parsed.visibleText,
    internalLinks: parsed.internalLinks,
    identifiedPages,
  };
}
