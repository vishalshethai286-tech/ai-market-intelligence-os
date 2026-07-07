import type { PageCategory } from "@/lib/website-analyzer";

export const DISCOVERY_MODEL = "claude-opus-4-8";
export const DISCOVERY_MAX_TOKENS = 8192;

/** Which identified-page categories are candidates for the bounded additional fetch. */
export const FETCH_CATEGORIES: PageCategory[] = ["product", "service", "catalog"];
/** Non-aggressive cap on how many extra pages we fetch beyond the homepage per run. */
export const MAX_ADDITIONAL_PAGES = 6;
/** Per-page text cap so a handful of pages combine into a bounded prompt. */
export const MAX_PAGE_TEXT_LENGTH = 2_500;

export const MAX_PRODUCTS_PER_RUN = 20;
