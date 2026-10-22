import axios from "axios";
import { URL } from "url";
import { load } from "cheerio";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Configuration - Besignitics Engine 1 Evidence Collection & Validation Handbook v1.0
// ---------------------------------------------------------------------------
export const HANDBOOK_VERSION = "1.0";
export const FRAMEWORK_VERSION = "2.1-handbook";
export const FETCH_TIMEOUT_MS = 20000;
export const MAX_URLS = Number(process.env.E1_MAX_URLS ?? 10);
export const MAX_CRAWL_PAGES = Number(process.env.E1_MAX_CRAWL_PAGES ?? 60);
export const CRAWL_DEPTH = 4;
export const RETRY_BACKOFF_MS = (process.env.E1_RETRY_BACKOFF_MS ?? "2000,5000,10000")
  .split(",")
  .map((v) => Number(v.trim()));
export const ROUNDS = 3;
// Handbook E1.03: rounds at least one hour apart. Each audit therefore takes about two hours; it runs as a background job.
export const ROUND_SPACING_MS = Number(process.env.E1_ROUND_SPACING_MS ?? 60000); // default 1 minute for fast runs; set E1_ROUND_SPACING_MS=3600000 for the handbook 1-hour spacing
export const CONCURRENCY = 2;
export const BROWSER_TIMEOUT_MS = 15000;
export const NEUTRAL_UA = "Mozilla/5.0 (compatible; Besignitics/1.0)";
export const INDEXNOW_KEY = (process.env.E1_INDEXNOW_KEY ?? "").trim();
export const EVALUATOR_VERSION = "engine1-eval-2026.10.1";
// Engine score is published only when assessed active weight / total active weight >= this value.
// PROVISIONAL PLACEHOLDER: not a validated release threshold (product decision pending validation).
export const MIN_COVERAGE = Number(process.env.E1_MIN_COVERAGE ?? 0.8);
// Reliability (E1.03) needs first-to-last round span of at least this many milliseconds.
export const MIN_OBSERVATION_SPAN_MS = Number(process.env.E1_MIN_SPAN_MS ?? 3600000);
// Signals that never carry independent weight.
export const DIAGNOSTIC_IDS = ["E1.04", "E1.05", "E1.06", "E1.08", "E1.11"];

// Decisions recorded for the audit output. Weights follow handbook v1.0 and are the implementation source of truth.
export const KNOWN_DISCREPANCIES = [
  "Weights follow handbook v1.0. Workbook v1.1 differs: E1.01 8%, E1.02 7%, E1.07 28%, E1.09 6%, E1.14 5%, and it omits E1.16.",
  "E1.09 is named 'Server-Delivered Content Parity' in handbook v1.0 and 'Initial HTML Content Availability' in workbook v1.1. Name kept.",
  "E1.14 is named 'Index & Snippet Eligibility' in handbook v1.0 and 'Retrieval Metadata Accessibility' in workbook v1.1. Name kept.",
  "Handbook full-block rule for robots.txt is not retained. Unavailable robots.txt gives UNASSESSED. A verified robots.txt rule is scored by its own text.",
  "E1.08 is diagnostic (0%) in handbook v1.0 and active 8% in workbook v1.1. Kept diagnostic pending the scored-or-diagnostic decision.",
  "E1.11 is diagnostic (0%) in handbook v1.0 and active 6% in workbook v1.1. Kept diagnostic pending the scored-or-diagnostic decision.",
  "Merge: E1.04 (sitemaps) is merged into E1.07 and carries no independent weight.",
  "Merge: E1.06 (internal links) is merged into E1.07 and carries no independent weight.",
  "Merge: E1.11 (schema coverage) is merged into E1.12 scope and carries no independent weight.",
];
export const DEFERRED_DECISIONS = [
  "Rename E1.09 to 'Initial HTML Content Availability' in code, reports and registry. Deferred.",
];

export const SCORE_BANDS = {
  strong: { min: 90, max: 100, label: "Strong" },
  moderate: { min: 70, max: 89.9, label: "Moderate" },
  weak: { min: 40, max: 69.9, label: "Weak" },
  critical: { min: 0, max: 39.9, label: "Critical" },
};

export const SIGNAL_IDS = [
  "E1.01", "E1.02", "E1.03", "E1.04", "E1.05", "E1.06", "E1.07", "E1.08",
  "E1.09", "E1.10", "E1.11", "E1.12", "E1.13", "E1.14", "E1.15", "E1.16",
];

export const WEIGHTS: Record<string, number> = {
  "E1.01": 14, "E1.02": 14, "E1.03": 8, "E1.04": 0, "E1.05": 0, "E1.06": 0,
  "E1.07": 12, "E1.08": 0, "E1.09": 18, "E1.10": 8, "E1.11": 0, "E1.12": 6,
  "E1.13": 5, "E1.14": 8, "E1.15": 3, "E1.16": 4,
};

// Registry integrity (handbook section 4 and failure analysis G1/G2).
// Returns a list of violations; an empty list means the registry is valid.
export function assertRegistry(): string[] {
  const errors: string[] = [];
  const ids = SIGNAL_IDS;
  if (new Set(ids).size !== ids.length) errors.push("duplicate signal IDs");
  for (const id of ids) {
    if (WEIGHTS[id] === undefined) errors.push(`${id} has no weight`);
    if (!SIGNAL_NAMES[id]) errors.push(`${id} has no name`);
  }
  for (const id of Object.keys(WEIGHTS)) {
    if (ids.indexOf(id) < 0) errors.push(`unknown ID ${id}`);
  }
  for (const id of DIAGNOSTIC_IDS) {
    if (WEIGHTS[id] !== 0) errors.push(`${id} is diagnostic but has weight ${WEIGHTS[id]}`);
  }
  const total = ids.reduce((t, id) => t + (WEIGHTS[id] || 0), 0);
  if (total !== 100) errors.push(`active weights sum to ${total}, expected 100`);
  return errors;
}

export const SIGNAL_NAMES: Record<string, string> = {
  "E1.01": "Effective Crawl Access",
  "E1.02": "Crawler Policy by Class",
  "E1.03": "Retrieval Response Reliability",
  "E1.04": "Sitemap Discoverability",
  "E1.05": "Important Page Discoverability",
  "E1.06": "Internal Link Discoverability",
  "E1.07": "Retrieval Path Coverage",
  "E1.08": "Content Rendering Accessibility",
  "E1.09": "Server-Delivered Content Parity",
  "E1.10": "Content Extractability",
  "E1.11": "Structured Data Coverage",
  "E1.12": "Structured Data Quality",
  "E1.13": "Canonical & Duplicate Resolution",
  "E1.14": "Index & Snippet Eligibility",
  "E1.15": "Content Update Detectability",
  "E1.16": "Search Index Presence",
};

export const CORE_AGENTS: { id: string; token: string; ua: string; cls: "search" | "user-fetch" }[] = [
  { id: "oai-searchbot", token: "OAI-SearchBot", ua: "OAI-SearchBot/1.0 (compatible; ChatGPT-User)", cls: "search" },
  { id: "chatgpt-user", token: "ChatGPT-User", ua: "Mozilla/5.0 (compatible; ChatGPT-User)", cls: "user-fetch" },
  { id: "claude-searchbot", token: "Claude-SearchBot", ua: "Claude-SearchBot/1.0 (compatible; Anthropic)", cls: "search" },
  { id: "claude-user", token: "Claude-User", ua: "Mozilla/5.0 (compatible; Claude-User)", cls: "user-fetch" },
  { id: "perplexitybot", token: "PerplexityBot", ua: "PerplexityBot/1.0 (compatible; Perplexity)", cls: "search" },
  { id: "googlebot", token: "Googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1)", cls: "search" },
  { id: "bingbot", token: "Bingbot", ua: "Mozilla/5.0 (compatible; Bingbot/2.0)", cls: "search" },
];
export const GROUNDING_TOKEN = "Google-Extended";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Kind = "usable" | "blocked" | "transient";

export interface Fetched {
  status: number;
  body: string;
  finalUrl: string;
  headers: Record<string, string>;
  transport: boolean;
  error: string | null;
}

export interface Signal {
  signal_id: string;
  signal_name: string;
  weight: number;
  is_diagnostic: boolean;
  score: number | null;
  status: string;
  assessment: string;
  confidence: string;
  evidence_summary: Record<string, string | number>;
  explanation: string;
  recommendation: string;
  evidence?: unknown[];
}

export interface Rule {
  allow: boolean;
  path: string;
}
export interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsState {
  f: Fetched;
  retries: number;
  mode: "parsed" | "no_restrictions" | "policy_unavailable";
  groups: Group[];
  body: string;
}

export interface SitemapFile {
  url: string;
  status: number;
  valid: boolean;
  urls: string[];
  lastmod: Record<string, string>;
  errors: string[];
}
export interface Sitemaps {
  files: SitemapFile[];
  listed: Record<string, boolean>;
  lastmod: Record<string, string>;
}

export interface CrawlPage {
  url: string;
  depth: number;
  html: string;
}
export interface Crawl {
  pages: Record<string, CrawlPage>;
  depth: Record<string, number>;
  nofollowTargets: Record<string, boolean>;
  brokenLinks: number;
  error: string | null;
}

export interface Rendered {
  url: string;
  html: string;
  consoleErrors: number;
  failedRequests: number;
  timedOut: boolean;
}
export interface RenderResult {
  available: boolean;
  reason: string;
  version: string;
  pages: Record<string, Rendered>;
}

export interface Ctx {
  domain: string;
  home: string;
  urls: string[];
  inventoryNote: string;
  customerUrlCount: number;
  robots: RobotsState;
  sitemaps: Sitemaps;
  pages: Record<string, Fetched>;
  crawl: Crawl;
  render: RenderResult;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
export const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const round1 = (n: number): number => Math.round(n * 10) / 10;

export function getStatusBand(score: number): string {
  if (score >= SCORE_BANDS.strong.min) return SCORE_BANDS.strong.label;
  if (score >= SCORE_BANDS.moderate.min) return SCORE_BANDS.moderate.label;
  if (score >= SCORE_BANDS.weak.min) return SCORE_BANDS.weak.label;
  return SCORE_BANDS.critical.label;
}

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href;
  } catch {
    return u;
  }
}

export function resolveUrl(href: string | undefined, base: string): string {
  if (!href) return "";
  try {
    return normUrl(new URL(href.trim(), base).href);
  } catch {
    return "";
  }
}

export function isHtmlCandidate(u: string, domain: string): boolean {
  try {
    const x = new URL(u);
    if (x.hostname !== domain) return false;
    if (x.protocol !== "https:" && x.protocol !== "http:") return false;
    return !/\.(pdf|jpe?g|png|gif|webp|svg|css|js|xml|json|zip|mp4|mp3)$/i.test(x.pathname);
  } catch {
    return false;
  }
}

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9À-￿]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function overlap(unit: string, pool: Set<string>): number {
  const ut = tokens(unit);
  if (ut.length === 0) return 0;
  let hit = 0;
  for (const t of ut) if (pool.has(t)) hit++;
  return hit / ut.length;
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter++;
  });
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function shingleSet(text: string): Set<string> {
  const t = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i + 5 <= t.length; i++) out.add(t.slice(i, i + 5).join(" "));
  return out;
}

export function hashText(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function isOk(f: Fetched | undefined): f is Fetched {
  return !!f && !f.transport && f.status >= 200 && f.status < 300;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// HTML text helpers
// ---------------------------------------------------------------------------
export function visibleText(html: string): string {
  const $ = load(html);
  $("script, style, template").remove();
  const title = $("title").first().text();
  const body = $("body").length ? $("body").text() : $.root().text();
  return (title + " " + body).replace(/\s+/g, " ").trim();
}

export function scriptText(html: string): string {
  const $ = load(html);
  let out = "";
  $("script").each((_, el) => {
    out += " " + $(el).text();
  });
  return out;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
export async function fetchPage(url: string, ua: string, follow = true): Promise<Fetched> {
  try {
    const r = await axios.get(url, {
      headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: follow ? 5 : 0,
      maxContentLength: 2000000,
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(d: any) => d],
    });
    const body = typeof r.data === "string" ? r.data : "";
    const headers: Record<string, string> = {};
    const raw: any = r.headers || {};
    for (const k of Object.keys(raw)) headers[k.toLowerCase()] = String(raw[k]);
    const finalUrl = ((r.request as any)?.res?.responseUrl as string) || url;
    return { status: r.status, body, finalUrl, headers, transport: false, error: null };
  } catch (err: any) {
    return {
      status: 0,
      body: "",
      finalUrl: url,
      headers: {},
      transport: true,
      error: String(err.code || err.message || "request failed"),
    };
  }
}

// Page classification (handbook E1.01 section D)
export function isChallenge(body: string): boolean {
  const h = body.slice(0, 20000).toLowerCase();
  return /cf-chl|challenge-platform|just a moment\.\.\.|attention required! \| cloudflare|verify you are human|g-recaptcha|h-captcha|captcha-delivery/.test(h);
}

export function isLoginWall(body: string): boolean {
  const h = body.slice(0, 20000).toLowerCase();
  return /<input[^>]+type=["']password["']/.test(h) && !/<main|<article/.test(h);
}

export function isEmptyShell(body: string): boolean {
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < 200;
}

export function isUsable(f: Fetched): boolean {
  const ct = f.headers["content-type"];
  // Expected content type: when the server declares one, it must be HTML (failure analysis E1.01).
  if (ct && !/text\/html|application\/xhtml\+xml/i.test(ct)) return false;
  return (
    !f.transport &&
    f.status >= 200 &&
    f.status < 300 &&
    f.body.length > 0 &&
    !isChallenge(f.body) &&
    !isLoginWall(f.body) &&
    !isEmptyShell(f.body)
  );
}

export function classify(f: Fetched): Kind {
  if (f.transport || f.status === 429 || f.status >= 500) return "transient";
  if (isUsable(f)) return "usable";
  return "blocked";
}

export async function fetchWithRetry(url: string, ua: string): Promise<{ f: Fetched; kind: Kind; retries: number }> {
  let f = await fetchPage(url, ua);
  let kind = classify(f);
  let retries = 0;
  while (kind === "transient" && retries < RETRY_BACKOFF_MS.length) {
    await sleep(RETRY_BACKOFF_MS[retries]);
    retries++;
    f = await fetchPage(url, ua);
    kind = classify(f);
  }
  return { f, kind, retries };
}

// ---------------------------------------------------------------------------
// robots.txt (RFC 9309 style)
// ---------------------------------------------------------------------------
export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let afterRule = false;
  for (const raw of text.slice(0, 500000).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || afterRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      afterRule = false;
    } else if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ allow: key === "allow", path: value });
      afterRule = true;
    }
  }
  return groups;
}

export function rulesFor(groups: Group[], token: string): Rule[] | null {
  const t = token.toLowerCase();
  let rules: Rule[] = [];
  let found = false;
  for (const g of groups) {
    if (g.agents.indexOf(t) >= 0) {
      found = true;
      rules = rules.concat(g.rules);
    }
  }
  if (!found) {
    for (const g of groups) {
      if (g.agents.indexOf("*") >= 0) {
        found = true;
        rules = rules.concat(g.rules);
      }
    }
  }
  return found ? rules : null;
}

export function ruleMatches(pattern: string, path: string): boolean {
  let src = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (ch === "*") src += ".*";
    else if (ch === "$" && i === pattern.length - 1) src += "$";
    else src += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  try {
    return new RegExp(src).test(path);
  } catch {
    return false;
  }
}

export function isAllowed(rules: Rule[] | null, path: string): boolean {
  if (!rules) return true;
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

export async function loadRobots(domain: string): Promise<RobotsState> {
  const r = await fetchWithRetry(`https://${domain}/robots.txt`, NEUTRAL_UA);
  if (r.kind === "transient") return { f: r.f, retries: r.retries, mode: "policy_unavailable", groups: [], body: "" };
  if (r.f.status >= 200 && r.f.status < 300) {
    return { f: r.f, retries: r.retries, mode: "parsed", groups: parseRobots(r.f.body), body: r.f.body };
  }
  return { f: r.f, retries: r.retries, mode: "no_restrictions", groups: [], body: "" };
}

export function robotsBlocks(robots: RobotsState, token: string, url: string): boolean {
  if (robots.mode === "policy_unavailable") return true;
  if (robots.mode === "no_restrictions") return false;
  const u = new URL(url);
  return !isAllowed(rulesFor(robots.groups, token), u.pathname + u.search);
}

// ---------------------------------------------------------------------------
// Sitemaps (E1.04)
// ---------------------------------------------------------------------------
export function parseSitemapXml(xml: string): { type: "urlset" | "index" | "invalid"; locs: { loc: string; lastmod: string }[]; errors: string[] } {
  const errors: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isUrlset = /<urlset[\s>]/i.test(xml);
  if (!isIndex && !isUrlset) return { type: "invalid", locs: [], errors: ["no urlset or sitemapindex root"] };
  if (isUrlset && !/<\/urlset>/i.test(xml)) errors.push("urlset not closed");
  if (isIndex && !/<\/sitemapindex>/i.test(xml)) errors.push("sitemapindex not closed");
  const locs: { loc: string; lastmod: string }[] = [];
  const blockRe = isIndex ? /<sitemap>([\s\S]*?)<\/sitemap>/gi : /<url>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(m[1]);
    const lm = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1]);
    if (loc) locs.push({ loc: loc[1].replace(/&amp;/g, "&"), lastmod: lm ? lm[1] : "" });
    else errors.push("entry without loc");
  }
  return { type: isIndex ? "index" : "urlset", locs, errors };
}

export async function discoverSitemaps(domain: string, robotsBody: string): Promise<Sitemaps> {
  const candidates: string[] = [];
  const re = /^\s*sitemap:\s*(\S+)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(robotsBody)) !== null) candidates.push(m[1]);
  const defaultUrl = `https://${domain}/sitemap.xml`;
  if (candidates.indexOf(defaultUrl) < 0) candidates.push(defaultUrl);

  const files: SitemapFile[] = [];
  const queue = candidates.slice(0, 20);
  const seen: Record<string, boolean> = {};
  let fetched = 0;
  while (queue.length > 0 && fetched < 30) {
    const url = queue.shift() as string;
    if (seen[url]) continue;
    seen[url] = true;
    fetched++;
    const f = await fetchPage(url, NEUTRAL_UA);
    if (!isOk(f)) {
      const bad: Fetched = f;
      files.push({ url, status: bad.status, valid: false, urls: [], lastmod: {}, errors: [bad.transport ? "transport error" : `HTTP ${bad.status}`] });
      continue;
    }
    const parsed = parseSitemapXml(f.body);
    if (parsed.type === "invalid") {
      files.push({ url, status: f.status, valid: false, urls: [], lastmod: {}, errors: parsed.errors });
      continue;
    }
    if (parsed.type === "index") {
      for (const child of parsed.locs) if (queue.length < 40) queue.push(child.loc);
      files.push({ url, status: f.status, valid: true, urls: [], lastmod: {}, errors: parsed.errors });
    } else {
      const urls: string[] = [];
      const lastmod: Record<string, string> = {};
      for (const e of parsed.locs) {
        const n = normUrl(e.loc);
        urls.push(n);
        if (e.lastmod) lastmod[n] = e.lastmod;
      }
      files.push({ url, status: f.status, valid: parsed.errors.length === 0, urls, lastmod, errors: parsed.errors });
    }
  }

  const listed: Record<string, boolean> = {};
  const lastmod: Record<string, string> = {};
  for (const file of files) {
    if (!file.valid) continue;
    for (const u of file.urls) {
      listed[u] = true;
      if (file.lastmod[u]) lastmod[u] = file.lastmod[u];
    }
  }
  return { files, listed, lastmod };
}

// ---------------------------------------------------------------------------
// Inventory (E1.05) and crawl (E1.06)
// ---------------------------------------------------------------------------
export function buildInventory(domain: string, sitemaps: Sitemaps, customerUrls: string[]): { urls: string[]; note: string } {
  const home = normUrl(`https://${domain}/`);
  const urls: string[] = [home];
  let fromCustomer = 0;
  let fromSitemap = 0;
  const add = (u: string, source: "customer" | "sitemap"): void => {
    if (urls.length >= MAX_URLS) return;
    const n = resolveUrl(u, home);
    if (!n || urls.indexOf(n) >= 0 || !isHtmlCandidate(n, domain)) return;
    urls.push(n);
    if (source === "customer") fromCustomer++;
    else fromSitemap++;
  };
  for (const u of customerUrls) add(u, "customer");
  for (const file of sitemaps.files) {
    if (!file.valid) continue;
    for (const u of file.urls) add(u, "sitemap");
  }
  return { urls, note: `homepage + ${fromCustomer} customer URL(s) + ${fromSitemap} sitemap URL(s)` };
}

export async function crawlSite(domain: string, home: string): Promise<Crawl> {
  const crawl: Crawl = { pages: {}, depth: {}, nofollowTargets: {}, brokenLinks: 0, error: null };
  let frontier: string[] = [home];
  crawl.depth[home] = 0;
  let pageCount = 0;
  for (let depth = 0; depth <= CRAWL_DEPTH && frontier.length > 0; depth++) {
    const current = frontier;
    frontier = [];
    const results = await mapLimit(current, CONCURRENCY, (url) => fetchPage(url, NEUTRAL_UA));
    for (let i = 0; i < current.length; i++) {
      const url = current[i];
      const f = results[i];
      if (!isOk(f)) {
        const bad: Fetched = f;
        if (url === home) crawl.error = bad.transport ? "homepage transport error" : `homepage HTTP ${bad.status}`;
        crawl.brokenLinks++;
        continue;
      }
      crawl.pages[url] = { url, depth, html: f.body };
      pageCount++;
      if (depth === CRAWL_DEPTH) continue;
      const $ = load(f.body);
      $("a[href]").each((_, el) => {
        const target = resolveUrl($(el).attr("href"), url);
        if (!target || !isHtmlCandidate(target, domain)) return;
        const rel = ($(el).attr("rel") || "").toLowerCase();
        if (rel.indexOf("nofollow") >= 0) {
          crawl.nofollowTargets[target] = true;
          return;
        }
        if (crawl.depth[target] !== undefined) return;
        if (pageCount + frontier.length >= MAX_CRAWL_PAGES) return;
        crawl.depth[target] = depth + 1;
        frontier.push(target);
      });
    }
  }
  return crawl;
}

export function anchorSet(html: string, base: string): Set<string> {
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const u = resolveUrl($(el).attr("href"), base);
    if (u) out.add(u);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Signal constructors
// ---------------------------------------------------------------------------
export function scored(
  id: string,
  score: number | null,
  assessment: string,
  confidence: string,
  evidence: Record<string, string | number>,
  explanation: string,
  recommendation: string,
  extra?: unknown[]
): Signal {
  return {
    signal_id: id,
    signal_name: SIGNAL_NAMES[id],
    weight: WEIGHTS[id],
    is_diagnostic: false,
    score,
    status: score === null ? assessment : getStatusBand(score),
    assessment,
    confidence,
    evidence_summary: evidence,
    explanation,
    recommendation,
    evidence: extra,
  };
}

export function diagnostic(
  id: string,
  status: string,
  evidence: Record<string, string | number>,
  explanation: string,
  recommendation: string,
  confidence = "medium"
): Signal {
  return {
    signal_id: id,
    signal_name: SIGNAL_NAMES[id],
    weight: 0,
    is_diagnostic: true,
    score: null,
    status,
    assessment: status,
    confidence,
    evidence_summary: evidence,
    explanation,
    recommendation,
  };
}
