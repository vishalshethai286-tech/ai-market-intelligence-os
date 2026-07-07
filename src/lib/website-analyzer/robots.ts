import "server-only";
import { safeFetchText } from "./safe-fetch";
import { MAX_ROBOTS_BYTES, USER_AGENT } from "./constants";

const OUR_TOKEN = "AIMarketIntelligenceOS-WebsiteAnalyzer";

type Rule = { prefix: string; allow: boolean };

/** Minimal robots.txt parser: groups by User-agent, collects Allow/Disallow prefixes. */
function parseRobotsTxt(text: string): { ourRules: Rule[]; wildcardRules: Rule[] } {
  const ourRules: Rule[] = [];
  const wildcardRules: Rule[] = [];

  let currentTargets: Rule[][] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      if (agent === "*") {
        currentTargets = [wildcardRules];
      } else if (OUR_TOKEN.toLowerCase().includes(agent) || agent.includes("aimarketintelligenceos")) {
        currentTargets = [ourRules];
      } else {
        currentTargets = [];
      }
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (currentTargets.length === 0 || !value) continue;
      for (const target of currentTargets) {
        target.push({ prefix: value, allow: field === "allow" });
      }
    }
  }

  return { ourRules, wildcardRules };
}

/** Longest matching prefix wins, per the (informal but widely-followed) robots.txt convention. */
function isPathAllowed(path: string, rules: Rule[]): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (path.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/**
 * Best-effort robots.txt check. If robots.txt can't be fetched or parsed,
 * fails open (allowed) — the same convention real crawlers use, since a
 * missing/unreachable robots.txt is not a signal to block.
 */
export async function isAllowedByRobots(origin: string, pathname: string): Promise<boolean> {
  try {
    const result = await safeFetchText(new URL("/robots.txt", origin).toString(), MAX_ROBOTS_BYTES);
    if (result.status >= 400) return true;

    const { ourRules, wildcardRules } = parseRobotsTxt(result.body);
    const rules = ourRules.length > 0 ? ourRules : wildcardRules;
    return isPathAllowed(pathname || "/", rules);
  } catch {
    return true;
  }
}

export { USER_AGENT };
