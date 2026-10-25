/** Status words are fixed by Core Rule 2. Do not add new ones. */
export type CheckStatus = "PASS" | "FAIL" | "NOT_ASSESSED" | "NOT_APPLICABLE";

export const CHECK_IDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_NAMES: Record<CheckId, string> = {
  A1: "AI crawlers are allowed",
  A2: "Key pages load normally",
  A3: "Main text is in the raw HTML (no JavaScript needed)",
  A4: "Title and main heading are in the raw HTML",
  A5: "Meta description exists",
  A6: "Business basics are text, not images",
  A7: "Prices and plans are text",
  A8: "Canonical tag is correct",
  A9: "No blocking tags on key pages",
  A10: "Sitemap is valid and complete",
  A11: "Key pages are linked from the homepage",
  A12: "Structured data is valid",
};

export interface Evidence {
  /** URL that was checked (or "*" for a site-level result). */
  url: string;
  /** ISO timestamp of the observation. */
  observedAt: string;
  checkVersion: string;
  /** Raw excerpt(s) or measured values. */
  data: Record<string, unknown>;
}

export interface PageResult {
  pageUrl: string;
  status: CheckStatus;
  reason: string;
  nextStep: string | null;
  evidence: Evidence;
}

/** One check, site level, plus the per-page results it was built from. */
export interface CheckOutcome {
  checkId: CheckId;
  name: string;
  status: CheckStatus;
  reason: string;
  /** Required for NOT_ASSESSED and NOT_APPLICABLE (Core Rule 3); also set for FAIL (what to change). */
  nextStep: string | null;
  evidence: Evidence;
  pages: PageResult[];
}

/** Shape of an HTTP observation, stored raw as evidence. */
export interface HttpObservation {
  requestedUrl: string;
  finalUrl: string;
  /** Final HTTP status; null when no response (timeout, network error, budget, robots). */
  status: number | null;
  headers: Record<string, string>;
  body: string;
  /** Raw bytes length. */
  bytes: number;
  contentType: string;
  redirectChain: { url: string; status: number }[];
  outcome: "OK" | "TIMEOUT" | "NETWORK_ERROR" | "REDIRECT_LOOP" | "TOO_MANY_REDIRECTS" | "BUDGET_EXHAUSTED" | "ROBOTS_BLOCKED";
  error?: string;
  /** Number of HTTP requests this observation used (including retries and redirect hops). */
  requestsUsed: number;
  /** Retries due to 429/timeouts. */
  retries: number;
  fetchedAt: string;
}

/** Rolls per-page statuses up to one site-level status. Not a score: FAIL wins, then NOT_ASSESSED. */
export function rollUp(statuses: CheckStatus[]): CheckStatus {
  if (statuses.length === 0) return "NOT_ASSESSED";
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("NOT_ASSESSED")) return "NOT_ASSESSED";
  if (statuses.every((s) => s === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
  return "PASS";
}
