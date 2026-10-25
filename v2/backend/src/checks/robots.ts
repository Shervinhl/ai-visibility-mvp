/**
 * robots.txt parser and matcher following RFC 9309:
 * - Groups start with one or more user-agent lines; rules follow.
 * - A crawler uses all groups whose user-agent equals its product token (case-insensitive), merged.
 *   If none match, it uses the "*" groups. If there are none, everything is allowed.
 * - Allow/Disallow patterns support "*" and a trailing "$". The longest matching pattern wins;
 *   on a tie, Allow wins. An empty Disallow means nothing is disallowed.
 * - /robots.txt itself is always allowed.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface RobotsDecision {
  allowed: boolean;
  /** The group agent that applied ("*" or a token), or null if no group applied. */
  matchedAgent: string | null;
  /** The rule that decided, or null when allowed by default. */
  rule: RobotsRule | null;
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const colon = line.indexOf(":");
    if (colon < 0) return;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      // "Googlebot/2.1" -> "googlebot": only the product token is compared.
      current.agents.push(value.split("/")[0].trim().toLowerCase());
      lastWasAgent = true;
      return;
    }
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      return; // sitemap lines do not end a group's user-agent list per common practice
    }
    if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) return; // rules before any user-agent line are ignored
      if (key === "disallow" && value === "") return; // empty disallow: no restriction
      current.rules.push({ allow: key === "allow", pattern: value, line: idx + 1 });
      return;
    }
    // Other directives (crawl-delay, host, ...) do not affect matching but do end the agent list.
    lastWasAgent = false;
  });
  return { groups, sitemaps };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Converts a robots pattern into an anchored regular expression. */
function patternToRegex(pattern: string): RegExp {
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = safeDecode(body)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + escaped + (anchoredEnd ? "$" : ""));
}

export function isAllowed(parsed: ParsedRobots, productToken: string, pathAndQuery: string): RobotsDecision {
  if (pathAndQuery === "/robots.txt") return { allowed: true, matchedAgent: null, rule: null };
  const token = productToken.toLowerCase();
  let applicable = parsed.groups.filter((g) => g.agents.includes(token));
  let matchedAgent: string | null = token;
  if (applicable.length === 0) {
    applicable = parsed.groups.filter((g) => g.agents.includes("*"));
    matchedAgent = applicable.length ? "*" : null;
  }
  if (applicable.length === 0) return { allowed: true, matchedAgent: null, rule: null };
  const target = safeDecode(pathAndQuery);
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!patternToRegex(rule.pattern).test(target)) continue;
      const len = rule.pattern.length;
      if (len > bestLen || (len === bestLen && rule.allow && best && !best.allow)) {
        best = rule;
        bestLen = len;
      }
    }
  }
  if (!best) return { allowed: true, matchedAgent, rule: null };
  return { allowed: best.allow, matchedAgent, rule: best };
}
