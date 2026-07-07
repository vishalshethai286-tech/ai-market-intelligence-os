/** Identifies us to site owners so they can recognize/block the bot if they want. */
export const USER_AGENT = "AIMarketIntelligenceOS-WebsiteAnalyzer/1.0 (+website analyzer; single-page, non-recursive)";

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;

/** Homepage HTML — generous enough for a real page, small enough to bound memory. */
export const MAX_HOMEPAGE_BYTES = 2_000_000;
/** robots.txt is always tiny; anything huge is not a real robots.txt. */
export const MAX_ROBOTS_BYTES = 100_000;

/** Only fetch the standard web ports — no probing internal services on odd ports. */
export const ALLOWED_PORTS = new Set(["80", "443", ""]);

export const MAX_LINKS_STORED = 50;
export const MAX_TEXT_LENGTH = 5_000;
export const MAX_HEADINGS_PER_LEVEL = 20;

/** Minimum time between analysis runs for the same workspace. */
export const REANALYSIS_COOLDOWN_MS = 60_000;
