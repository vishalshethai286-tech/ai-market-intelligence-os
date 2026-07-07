import "server-only";
import * as cheerio from "cheerio";
import { MAX_HEADINGS_PER_LEVEL, MAX_LINKS_STORED, MAX_TEXT_LENGTH } from "./constants";

export type ParsedLink = { href: string; text: string };

export type ParsedHomepage = {
  title: string | null;
  metaDescription: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  visibleText: string;
  internalLinks: ParsedLink[];
};

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseHomepage(html: string, baseUrl: string): ParsedHomepage {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  $("script, style, noscript, template, svg").remove();

  const title = cleanText($("title").first().text()) || null;
  const metaDescription =
    cleanText($('meta[name="description"]').attr("content") ?? "") || null;

  const headings = {
    h1: $("h1")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, MAX_HEADINGS_PER_LEVEL),
    h2: $("h2")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, MAX_HEADINGS_PER_LEVEL),
    h3: $("h3")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, MAX_HEADINGS_PER_LEVEL),
  };

  const visibleText = cleanText($("body").text()).slice(0, MAX_TEXT_LENGTH);

  const seen = new Set<string>();
  const internalLinks: ParsedLink[] = [];

  $("a[href]").each((_, el) => {
    if (internalLinks.length >= MAX_LINKS_STORED) return;

    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }

    if (resolved.hostname !== base.hostname) return;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;

    const normalized = `${resolved.origin}${resolved.pathname}`;
    if (seen.has(normalized)) return;
    seen.add(normalized);

    internalLinks.push({ href: normalized, text: cleanText($(el).text()).slice(0, 200) });
  });

  return { title, metaDescription, headings, visibleText, internalLinks };
}
