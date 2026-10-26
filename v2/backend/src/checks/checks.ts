import { CheckConfig } from "../config";
import { FactList } from "../facts/types";
import { RobotsState } from "./fetcher";
import { countWords, extractLinks, extractMainContent, isHtmlContentType, loadHtml, visibleText, wordBoundaryRegex, excerptAround, escapeRegex } from "./html";
import { RenderResult } from "./renderer";
import { isAllowed } from "./robots";
import { SitemapResult } from "./sitemap";
import { CheckId, CheckOutcome, CHECK_NAMES, CheckStatus, Evidence, HttpObservation, PageResult, rollUp } from "./types";
import { normalizeUrl, originOf, robotsPath } from "./url";

/** Everything the run observed. Checks are pure functions of this data. */
export interface SiteData {
  checkVersion: string;
  cfg: CheckConfig;
  homepage: string;
  keyPages: string[];
  keyPageSource: "client" | "sitemap" | "none";
  facts: FactList | null;
  /** robots.txt state per origin (the homepage origin is always present). */
  robots: Map<string, RobotsState>;
  /** First fetch of every page (homepage, key pages, contact/about and price pages). */
  pages: Map<string, HttpObservation>;
  /** A2 attempts per page (homepage and key pages), attempt 1 is the first fetch. */
  attempts: Map<string, HttpObservation[]>;
  /** A3 render per page; a string means the render was not done and why. */
  renders: Map<string, RenderResult | { ok: false; kind: "SKIPPED"; message: string }>;
  sitemap: SitemapResult | null;
  /** A11 breadth-first link crawl. */
  linkCrawl: LinkCrawlResult | null;
  /** Observation time used for site-level evidence. */
  observedAt: string;
}

export interface LinkCrawlResult {
  /** normalized URL -> link depth from the homepage (0 = homepage). */
  reached: Map<string, number>;
  /** normalized URL -> the page that first linked to it. */
  via: Map<string, string>;
  /** True when every page within depth was expanded (no budget, robots, or fetch gaps). */
  complete: boolean;
  gaps: { url: string; depth: number; reason: string }[];
  pagesExpanded: number;
}

/** Pages the page-level checks run on: homepage first, then key pages. */
export function checkedPages(d: SiteData): string[] {
  return [d.homepage, ...d.keyPages];
}

function ev(d: SiteData, url: string, data: Record<string, unknown>, observedAt?: string): Evidence {
  return { url, observedAt: observedAt ?? d.observedAt, checkVersion: d.checkVersion, data };
}

function page(pageUrl: string, status: CheckStatus, reason: string, nextStep: string | null, evidence: Evidence): PageResult {
  return { pageUrl, status, reason, nextStep, evidence };
}

function obsSummary(o: HttpObservation): Record<string, unknown> {
  return {
    requestedUrl: o.requestedUrl,
    finalUrl: o.finalUrl,
    httpStatus: o.status,
    outcome: o.outcome,
    error: o.error ?? null,
    contentType: o.contentType,
    redirectChain: o.redirectChain,
    retries: o.retries,
    fetchedAt: o.fetchedAt,
  };
}

/**
 * Common gate for checks that read a page's HTML.
 * Returns the observation when the page is a fetched 200 HTML page, or a ready-made PageResult otherwise.
 */
function htmlGate(d: SiteData, url: string, opts: { nonHtmlNotApplicable: boolean; checkLabel: string }): { obs: HttpObservation } | { result: PageResult } {
  const obs = d.pages.get(url);
  if (!obs) {
    return { result: page(url, "NOT_ASSESSED", "The page was not fetched in this run.", "Re-run the check. If this repeats, raise V2_MAX_REQUESTS_PER_CHECK or reduce the number of key pages.", ev(d, url, {})) };
  }
  if (obs.outcome !== "OK" || obs.status === null) {
    const why =
      obs.outcome === "ROBOTS_BLOCKED"
        ? obs.error ?? "robots.txt blocked our checker"
        : obs.outcome === "BUDGET_EXHAUSTED"
          ? `The request cap (${d.cfg.maxRequestsPerCheck}) was reached before this page could be fetched.`
          : `The page could not be fetched (${obs.outcome}${obs.error ? ": " + obs.error : ""}).`;
    const next =
      obs.outcome === "ROBOTS_BLOCKED"
        ? `Needs: allow "${d.cfg.robotsToken}" in robots.txt for this page, or confirm the block is intended.`
        : obs.outcome === "BUDGET_EXHAUSTED"
          ? "Needs: a higher V2_MAX_REQUESTS_PER_CHECK or fewer key pages."
          : "Re-run the check when the site is reachable.";
    return { result: page(url, "NOT_ASSESSED", why, next, ev(d, url, obsSummary(obs), obs.fetchedAt)) };
  }
  if (obs.status !== 200) {
    return {
      result: page(url, "NOT_ASSESSED", `The page returned HTTP ${obs.status}, so ${opts.checkLabel} could not be read.`, "Fix the page load first (see check A2), then re-test.", ev(d, url, obsSummary(obs), obs.fetchedAt)),
    };
  }
  if (!isHtmlContentType(obs.contentType)) {
    if (opts.nonHtmlNotApplicable) {
      return {
        result: page(url, "NOT_APPLICABLE", `This page is a ${obs.contentType} file, not an HTML page, so ${opts.checkLabel} does not apply.`, "Does not apply; no action needed.", ev(d, url, obsSummary(obs), obs.fetchedAt)),
      };
    }
  }
  return { obs };
}

function siteOutcome(d: SiteData, checkId: CheckId, pages: PageResult[], summary: { reason: string; nextStep: string | null; data?: Record<string, unknown> }, statusOverride?: CheckStatus): CheckOutcome {
  const status = statusOverride ?? rollUp(pages.map((p) => p.status));
  return {
    checkId,
    name: CHECK_NAMES[checkId],
    status,
    reason: summary.reason,
    nextStep: summary.nextStep,
    evidence: ev(d, "*", { pageStatuses: pages.map((p) => ({ url: p.pageUrl, status: p.status })), ...(summary.data ?? {}) }),
    pages,
  };
}

function listUrls(results: PageResult[], status: CheckStatus): string[] {
  return results.filter((r) => r.status === status).map((r) => r.pageUrl);
}

/** Generic site-level wording for page-based checks. */
function pageSummary(results: PageResult[], passText: string, failText: string, failNext: string): { reason: string; nextStep: string | null } {
  const st = rollUp(results.map((r) => r.status));
  const fails = listUrls(results, "FAIL");
  const na = listUrls(results, "NOT_ASSESSED");
  if (st === "FAIL") {
    const extra = na.length ? ` ${na.length} page(s) could not be checked.` : "";
    return { reason: `${failText} on ${fails.length} of ${results.length} page(s): ${fails.join(", ")}.${extra}`, nextStep: failNext };
  }
  if (st === "NOT_ASSESSED") {
    const first = results.find((r) => r.status === "NOT_ASSESSED");
    return { reason: `${na.length} of ${results.length} page(s) could not be checked: ${na.join(", ")}. First reason: ${first?.reason ?? ""}`, nextStep: first?.nextStep ?? "Re-run the check." };
  }
  if (st === "NOT_APPLICABLE") return { reason: "This check does not apply to any checked page (all are non-HTML files).", nextStep: "Does not apply; no action needed." };
  return { reason: passText, nextStep: null };
}

// ---------------------------------------------------------------------------
// A1. AI crawlers are allowed
// ---------------------------------------------------------------------------
export function checkA1(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  for (const url of checkedPages(d)) {
    const origin = originOf(url);
    const state = d.robots.get(origin);
    if (!state) {
      results.push(page(url, "NOT_ASSESSED", `robots.txt for ${origin} was not fetched in this run.`, "Re-run the check; raise V2_MAX_REQUESTS_PER_CHECK if the request cap was reached.", ev(d, url, {})));
      continue;
    }
    if (state.kind === "UNAVAILABLE") {
      results.push(
        page(url, "NOT_ASSESSED", `${state.reason}.`, `Needs: ${origin}/robots.txt to return 200 or 404. Fix the server error, then re-test.`, ev(d, url, { robots: obsSummary(state.observation) }, state.observation.fetchedAt))
      );
      continue;
    }
    if (state.kind === "NO_RULES") {
      results.push(
        page(
          url,
          "PASS",
          `robots.txt returned HTTP ${state.status}, which means there are no rules: all crawlers are allowed (RFC 9309).`,
          null,
          ev(d, url, { robots: obsSummary(state.observation), crawlers: d.cfg.aiCrawlers.map((c) => ({ crawler: c, allowed: true })) }, state.observation.fetchedAt)
        )
      );
      continue;
    }
    const path = robotsPath(url);
    const decisions = d.cfg.aiCrawlers.map((c) => {
      const dec = isAllowed(state.parsed, c, path);
      return { crawler: c, allowed: dec.allowed, matchedGroup: dec.matchedAgent, rule: dec.rule ? `${dec.rule.allow ? "Allow" : "Disallow"}: ${dec.rule.pattern} (line ${dec.rule.line})` : null };
    });
    const blocked = decisions.filter((x) => !x.allowed);
    const data = { robotsUrl: `${origin}/robots.txt`, path, crawlers: decisions, robotsExcerpt: state.text.slice(0, 4000) };
    if (blocked.length) {
      results.push(
        page(
          url,
          "FAIL",
          `Blocked for ${blocked.map((b) => `${b.crawler} (${b.rule})`).join(", ")}.`,
          `Edit robots.txt so ${blocked.map((b) => b.crawler).join(", ")} may fetch ${path}, if you want AI tools to read it.`,
          ev(d, url, data, state.observation.fetchedAt)
        )
      );
    } else {
      results.push(page(url, "PASS", `All ${decisions.length} crawlers are allowed for ${path}.`, null, ev(d, url, data, state.observation.fetchedAt)));
    }
  }
  const s = pageSummary(results, `All ${d.cfg.aiCrawlers.join(", ")} may fetch every checked page.`, "One or more AI crawlers are blocked", "Change the robots.txt rules listed for each page.");
  return siteOutcome(d, "A1", results, s);
}

// ---------------------------------------------------------------------------
// A2. Key pages load normally
// ---------------------------------------------------------------------------
type AttemptClass = "OK" | "DEFINITE_FAIL" | "UNMEASURED";

function classifyAttempt(o: HttpObservation): { cls: AttemptClass; label: string } {
  if (o.outcome === "REDIRECT_LOOP") return { cls: "DEFINITE_FAIL", label: "redirect loop" };
  if (o.outcome === "TOO_MANY_REDIRECTS") return { cls: "DEFINITE_FAIL", label: "more than the allowed redirect hops" };
  if (o.outcome === "TIMEOUT") return { cls: "UNMEASURED", label: "timed out" };
  if (o.outcome === "NETWORK_ERROR") return { cls: "UNMEASURED", label: `network error (${o.error ?? ""})` };
  if (o.outcome === "BUDGET_EXHAUSTED") return { cls: "UNMEASURED", label: "not attempted: request cap reached" };
  if (o.outcome === "ROBOTS_BLOCKED") return { cls: "UNMEASURED", label: "not attempted: blocked by robots.txt for our checker" };
  if (o.status === 200) return { cls: "OK", label: "HTTP 200" };
  if (o.status === 429) return { cls: "UNMEASURED", label: "HTTP 429 after retries" };
  return { cls: "DEFINITE_FAIL", label: `HTTP ${o.status}` };
}

export function checkA2(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  const need = d.cfg.pageLoadAttempts;
  for (const url of checkedPages(d)) {
    const attempts = d.attempts.get(url) ?? [];
    const classes = attempts.map(classifyAttempt);
    const data = { attemptsRequired: need, attempts: attempts.map((a, i) => ({ attempt: i + 1, ...obsSummary(a), result: classes[i].label })) };
    const at = attempts[0]?.fetchedAt;
    const fails = classes.map((c, i) => ({ c, i })).filter((x) => x.c.cls === "DEFINITE_FAIL");
    if (fails.length) {
      results.push(
        page(
          url,
          "FAIL",
          `${fails.length} of ${attempts.length} attempt(s) failed: ${fails.map((f) => `attempt ${f.i + 1} ${f.c.label}`).join("; ")}.`,
          "Make the page return HTTP 200 directly or within 3 redirect hops, with no loop.",
          ev(d, url, data, at)
        )
      );
    } else if (attempts.length >= need && classes.slice(0, need).every((c) => c.cls === "OK")) {
      results.push(page(url, "PASS", `All ${need} attempts returned HTTP 200 on ${attempts[0].finalUrl}.`, null, ev(d, url, data, at)));
    } else {
      const missing = need - attempts.length;
      const issues = classes.filter((c) => c.cls === "UNMEASURED").map((c) => c.label);
      const why = [missing > 0 ? `${missing} attempt(s) not made` : "", issues.length ? `attempts ${issues.join(", ")}` : ""].filter(Boolean).join("; ");
      const budget = classes.some((c) => c.label.includes("request cap")) || missing > 0;
      results.push(
        page(
          url,
          "NOT_ASSESSED",
          `Could not confirm ${need} successful loads: ${why}.`,
          budget ? "Needs: a higher V2_MAX_REQUESTS_PER_CHECK or fewer key pages." : "Re-run the check later; if timeouts or 429 repeat, check server capacity or rate limits.",
          ev(d, url, data, at)
        )
      );
    }
  }
  const s = pageSummary(results, `Every checked page returned HTTP 200 on all ${need} attempts.`, "Pages failed to load", "Fix the errors or redirect problems listed for each page.");
  return siteOutcome(d, "A2", results, s);
}

// ---------------------------------------------------------------------------
// A3. Main text is in the raw HTML
// ---------------------------------------------------------------------------
export function checkA3(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  const threshold = d.cfg.renderWordThreshold;
  const ratio = d.cfg.renderRawRatio;
  for (const url of checkedPages(d)) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "main text" });
    if ("result" in gate) {
      results.push(gate.result);
      continue;
    }
    const raw = extractMainContent(gate.obs.body, gate.obs.finalUrl);
    const render = d.renders.get(url);
    const base = { rawWords: raw.words, rawMethod: raw.method, rawExcerpt: raw.text.slice(0, 600), thresholds: { renderWordThreshold: threshold, renderRawRatio: ratio } };
    if (!render || !render.ok) {
      const msg = render ? render.message : "The page was not rendered in this run.";
      const notInstalled = render && !render.ok && render.kind === "NOT_INSTALLED";
      results.push(
        page(
          url,
          "NOT_ASSESSED",
          notInstalled ? `Rendering with a browser is needed to compare, but it is not available: ${msg}` : `The page could not be rendered with a browser: ${msg}`,
          notInstalled ? `Needs: Playwright with Chromium on the server (${msg.includes("Install it with:") ? msg.split("Install it with:")[1].trim() : "npx playwright install chromium"}).` : "Re-run the check; if rendering keeps timing out, the page may need fewer scripts.",
          ev(d, url, { ...base, render: render ?? null }, gate.obs.fetchedAt)
        )
      );
      continue;
    }
    const rendered = extractMainContent(render.html, render.finalUrl);
    const share = rendered.words === 0 ? 1 : raw.words / rendered.words;
    const data = { ...base, renderedWords: rendered.words, renderedMethod: rendered.method, renderedExcerpt: rendered.text.slice(0, 600), rawShareOfRendered: Number(share.toFixed(4)) };
    if (rendered.words < threshold) {
      results.push(page(url, "PASS", `The rendered page has ${rendered.words} words of main text (under ${threshold}), so JavaScript is not hiding a large body of text. Raw HTML has ${raw.words} words.`, null, ev(d, url, data, gate.obs.fetchedAt)));
    } else if (share >= ratio) {
      results.push(page(url, "PASS", `Raw HTML has ${raw.words} of ${rendered.words} rendered words (${Math.round(share * 100)}%, at least ${Math.round(ratio * 100)}% needed).`, null, ev(d, url, data, gate.obs.fetchedAt)));
    } else {
      results.push(
        page(
          url,
          "FAIL",
          `Raw HTML has only ${raw.words} of ${rendered.words} rendered words (${Math.round(share * 100)}%, under ${Math.round(ratio * 100)}%). AI crawlers that do not run JavaScript miss most of this page.`,
          "Render the main content on the server (server-side rendering or static generation) so it is in the HTML response.",
          ev(d, url, data, gate.obs.fetchedAt)
        )
      );
    }
  }
  const s = pageSummary(results, "Main text is available in the raw HTML on every checked page.", "Main text needs JavaScript", "Server-render the main content on the pages listed.");
  return siteOutcome(d, "A3", results, s);
}

// ---------------------------------------------------------------------------
// A4. Title and main heading
// ---------------------------------------------------------------------------
export function checkA4(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  const titles = new Map<string, string>();
  const info: { url: string; title: string; h1s: string[]; at: string }[] = [];
  for (const url of checkedPages(d)) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "a title and main heading" });
    if ("result" in gate) {
      results.push(gate.result);
      continue;
    }
    const $ = loadHtml(gate.obs.body);
    const title = ($("head title").first().text() || $("title").first().text()).replace(/\s+/g, " ").trim();
    const h1s = $("h1")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim());
    info.push({ url, title, h1s, at: gate.obs.fetchedAt });
    if (title) {
      const key = title.toLowerCase();
      if (!titles.has(key)) titles.set(key, url);
    }
  }
  for (const p of info) {
    const problems: string[] = [];
    if (!p.title) problems.push("<title> is missing or empty");
    else {
      const owner = titles.get(p.title.toLowerCase());
      const dupes = info.filter((o) => o.url !== p.url && o.title && o.title.toLowerCase() === p.title.toLowerCase()).map((o) => o.url);
      if (owner && dupes.length) problems.push(`<title> "${p.title}" is also used by ${dupes.join(", ")}`);
    }
    if (p.h1s.length === 0) problems.push("no <h1>");
    else if (p.h1s.length > 1) problems.push(`${p.h1s.length} <h1> elements`);
    else if (!p.h1s[0]) problems.push("the <h1> is empty");
    const data = { title: p.title, h1Count: p.h1s.length, h1Texts: p.h1s.slice(0, 5) };
    if (problems.length) {
      results.push(page(p.url, "FAIL", problems.join("; ") + ".", "Give each page one unique, descriptive <title> and exactly one <h1> with text, in the HTML response.", ev(d, p.url, data, p.at)));
    } else {
      results.push(page(p.url, "PASS", `Title "${p.title}" and one <h1> "${p.h1s[0]}".`, null, ev(d, p.url, data, p.at)));
    }
  }
  results.sort((a, b) => checkedPages(d).indexOf(a.pageUrl) - checkedPages(d).indexOf(b.pageUrl));
  const base = pageSummary(results, "Every checked page has a unique title and exactly one main heading in the raw HTML.", "Title or main heading problems", "Fix the title and <h1> issues listed for each page.");
  // Name the exact problem on each failing page, so the client does not have to open the evidence.
  const failLines = results.filter((r) => r.status === "FAIL").map((r) => `${r.pageUrl} (${r.reason.replace(/\.$/, "")})`);
  const s = failLines.length ? { ...base, reason: `Title or main heading problems on ${failLines.length} of ${results.length} page(s): ${failLines.join("; ")}.` } : base;
  return siteOutcome(d, "A4", results, s);
}

// ---------------------------------------------------------------------------
// A5. Meta description
// ---------------------------------------------------------------------------
/** Legal and policy pages (terms, privacy, agreements, copyright) are not marketing pages. */
const LEGAL_PATH = /\/(terms|terms-of-service|terms-and-conditions|privacy|privacy-policy|cookies?|cookie-policy|legal|disclaimer|copyright[^/]*|creator-agreement|agreement[^/]*|refund[^/]*|acceptable-use)(\/|$|\?)/i;

export function isLegalPage(url: string): boolean {
  try {
    return LEGAL_PATH.test(new URL(url).pathname + "/");
  } catch {
    return false;
  }
}

export function checkA5(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  const { metaDescriptionMin: min, metaDescriptionMax: max } = d.cfg;
  for (const url of checkedPages(d)) {
    if (isLegalPage(url)) {
      results.push(page(url, "NOT_APPLICABLE", "This is a legal or policy page, which does not need a meta description for AI discovery.", "Does not apply; no action needed.", ev(d, url, { legalPage: true })));
      continue;
    }
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "a meta description" });
    if ("result" in gate) {
      results.push(gate.result);
      continue;
    }
    const $ = loadHtml(gate.obs.body);
    const metas = $("meta")
      .toArray()
      .filter((el) => ($(el).attr("name") ?? "").toLowerCase() === "description")
      .map((el) => ($(el).attr("content") ?? "").replace(/\s+/g, " ").trim());
    const desc = metas[0] ?? "";
    const data = { metaDescriptionCount: metas.length, description: desc, length: desc.length, range: [min, max] };
    if (!desc) {
      results.push(page(url, "FAIL", metas.length ? "The meta description is empty." : "There is no meta description.", `Add <meta name="description" content="..."> with ${min} to ${max} characters that says what the page offers.`, ev(d, url, data, gate.obs.fetchedAt)));
    } else if (desc.length < min || desc.length > max) {
      results.push(page(url, "FAIL", `The meta description has ${desc.length} characters (needed: ${min} to ${max}).`, `Rewrite it to ${min} to ${max} characters.`, ev(d, url, data, gate.obs.fetchedAt)));
    } else {
      results.push(page(url, "PASS", `Meta description has ${desc.length} characters.`, null, ev(d, url, data, gate.obs.fetchedAt)));
    }
  }
  const s = pageSummary(results, `Every checked page has a meta description of ${min} to ${max} characters.`, "Meta description problems", "Add or rewrite the meta descriptions listed.");
  return siteOutcome(d, "A5", results, s);
}

// ---------------------------------------------------------------------------
// A6. Business basics are text
// ---------------------------------------------------------------------------
function normalizeForPhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contactPagesFor(d: SiteData): string[] {
  const candidates = checkedPages(d).filter((u) => {
    try {
      return /contact|about/i.test(new URL(u).pathname);
    } catch {
      return false;
    }
  });
  const c = d.facts?.contact.url;
  if (c && !candidates.includes(c) && c !== d.homepage) candidates.push(c);
  return candidates;
}

export function a6PagesToFetch(d: Pick<SiteData, "homepage" | "keyPages" | "facts">): string[] {
  const c = d.facts?.contact.url;
  return c ? [c] : [];
}

export function checkA6(d: SiteData): CheckOutcome {
  if (!d.facts) {
    return siteOutcome(d, "A6", [], { reason: "No business fact list was supplied, so there is nothing to look for.", nextStep: "Needs: your business fact list (name, what you do, location, contact method)." }, "NOT_ASSESSED");
  }
  const f = d.facts;
  const scanUrls = [d.homepage, ...contactPagesFor(d)];
  const scanned: { url: string; text: string; html: string; finalUrl: string }[] = [];
  const unscanned: { url: string; why: string }[] = [];
  for (const url of scanUrls) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "business basics" });
    if ("result" in gate) {
      unscanned.push({ url, why: gate.result.reason });
      continue;
    }
    scanned.push({ url, text: visibleText(gate.obs.body), html: gate.obs.body, finalUrl: gate.obs.finalUrl });
  }
  if (!scanned.some((s) => s.url === d.homepage)) {
    return siteOutcome(
      d,
      "A6",
      [],
      { reason: `The homepage could not be read: ${unscanned.find((u) => u.url === d.homepage)?.why ?? "not fetched"}`, nextStep: "Fix the homepage load (check A2), then re-test.", data: { unscanned } },
      "NOT_ASSESSED"
    );
  }
  type Item = { item: string; status: "FOUND" | "NOT_FOUND" | "NOT_ASSESSED"; detail: string; foundOn?: string; excerpt?: string };
  const items: Item[] = [];
  const findRegex = (re: RegExp): { url: string; excerpt: string } | null => {
    for (const s of scanned) {
      const m = re.exec(s.text);
      if (m) return { url: s.url, excerpt: excerptAround(s.text, m.index, m[0].length, 60) };
    }
    return null;
  };
  const inAltOnly = (term: string): boolean => {
    const re = wordBoundaryRegex(term);
    return scanned.some((s) => {
      const $ = loadHtml(s.html);
      return $("img[alt]")
        .toArray()
        .some((el) => re.test($(el).attr("alt") ?? ""));
    });
  };
  // Name
  const nameHit = findRegex(wordBoundaryRegex(f.businessName));
  items.push(
    nameHit
      ? { item: "business name", status: "FOUND", detail: `"${f.businessName}" found as text`, foundOn: nameHit.url, excerpt: nameHit.excerpt }
      : { item: "business name", status: "NOT_FOUND", detail: inAltOnly(f.businessName) ? `"${f.businessName}" appears only in image alt text, not as page text` : `"${f.businessName}" not found as text` }
  );
  // What it does
  if (!f.whatItDoesPhrase || !f.whatItDoesPhrase.trim()) {
    items.push({ item: "what it does", status: "NOT_ASSESSED", detail: "Needs: a short phrase (3 to 10 words) from your site that says what you do, in the fact list field whatItDoesPhrase." });
  } else {
    const target = normalizeForPhrase(f.whatItDoesPhrase);
    const hit = scanned.find((s) => normalizeForPhrase(s.text).includes(target));
    items.push(hit ? { item: "what it does", status: "FOUND", detail: `phrase "${f.whatItDoesPhrase}" found as text`, foundOn: hit.url } : { item: "what it does", status: "NOT_FOUND", detail: `phrase "${f.whatItDoesPhrase}" not found as text` });
  }
  // Location
  if (!f.locations.length) {
    items.push({ item: "location", status: "NOT_ASSESSED", detail: "Needs: your location (city, region, country) in the fact list." });
  } else {
    let hit: { url: string; excerpt: string; term: string } | null = null;
    for (const loc of f.locations) {
      for (const term of [loc, loc.split(",")[0].trim()]) {
        if (!term) continue;
        const h = findRegex(wordBoundaryRegex(term));
        if (h) {
          hit = { ...h, term };
          break;
        }
      }
      if (hit) break;
    }
    items.push(hit ? { item: "location", status: "FOUND", detail: `"${hit.term}" found as text`, foundOn: hit.url, excerpt: hit.excerpt } : { item: "location", status: "NOT_FOUND", detail: `none of ${f.locations.map((l) => `"${l}"`).join(", ")} found as text` });
  }
  // Contact method
  const c = f.contact;
  if (!c.url && !c.email && !c.phone) {
    items.push({ item: "contact method", status: "NOT_ASSESSED", detail: "Needs: a contact page URL, email, or phone number in the fact list." });
  } else {
    const found: string[] = [];
    if (c.email) {
      const re = wordBoundaryRegex(c.email);
      for (const s of scanned) {
        const $ = loadHtml(s.html);
        const mailto = $("a[href^='mailto:' i]")
          .toArray()
          .some((el) => ($(el).attr("href") ?? "").toLowerCase().includes(c.email!.toLowerCase()));
        if (re.test(s.text) || mailto) {
          found.push(`email on ${s.url}`);
          break;
        }
      }
    }
    if (c.phone) {
      const digits = c.phone.replace(/\D/g, "");
      const tail = digits.slice(-Math.min(10, digits.length));
      if (tail.length >= 7) {
        for (const s of scanned) {
          if (s.text.replace(/\D/g, "").includes(tail)) {
            found.push(`phone on ${s.url}`);
            break;
          }
        }
      }
    }
    if (c.url) {
      const target = normalizeUrl(c.url, d.cfg.trackingParams);
      for (const s of scanned) {
        const linked = extractLinks(s.html, s.finalUrl).some((l) => normalizeUrl(l.resolved, d.cfg.trackingParams) === target && l.text.length > 0);
        if (linked || normalizeUrl(s.finalUrl, d.cfg.trackingParams) === target) {
          found.push(linked ? `text link to contact page on ${s.url}` : `contact page loads: ${s.url}`);
          break;
        }
      }
    }
    items.push(found.length ? { item: "contact method", status: "FOUND", detail: found.join("; ") } : { item: "contact method", status: "NOT_FOUND", detail: "no supplied contact method (page link, email or phone) found as text" });
  }
  const notFound = items.filter((i) => i.status === "NOT_FOUND");
  const notAssessed = items.filter((i) => i.status === "NOT_ASSESSED");
  const data = { items, pagesScanned: scanned.map((s) => s.url), pagesNotScanned: unscanned };
  if (notFound.length) {
    const extra = unscanned.length ? ` (${unscanned.length} contact/about page(s) could not be read)` : "";
    return siteOutcome(
      d,
      "A6",
      [],
      { reason: `Not found as text: ${notFound.map((i) => `${i.item} (${i.detail})`).join("; ")}${extra}. Pages searched: ${scanned.map((s) => s.url).join(", ")}.${notAssessed.length ? ` Could not check: ${notAssessed.map((i) => i.item).join(", ")}.` : ""}`, nextStep: "Write these details as plain HTML text on the homepage or the contact/about page (not inside images).", data },
      "FAIL"
    );
  }
  if (notAssessed.length) {
    return siteOutcome(d, "A6", [], { reason: `Could not check: ${notAssessed.map((i) => i.item).join(", ")}.`, nextStep: notAssessed.map((i) => i.detail).join(" "), data }, "NOT_ASSESSED");
  }
  return siteOutcome(d, "A6", [], { reason: "Business name, what you do, location and contact method are all present as text.", nextStep: null, data }, "PASS");
}

// ---------------------------------------------------------------------------
// A7. Prices and plans are text
// ---------------------------------------------------------------------------
export function priceRegex(amount: number): RegExp {
  if (amount === 0) return /(?<![\p{L}\p{N}])free(?![\p{L}\p{N}])|(?<![\d.,])0(?:[.,]00)?(?![\d.,]*\d)/iu;
  const [intPart, frac] = amount.toFixed(2).split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "[,.   ]?");
  const fracPart = frac === "00" ? "(?:[.,]00)?" : `[.,]${frac}`;
  return new RegExp(`(?<![\\d.,])${withSep}${fracPart}(?![\\d]|[.,]\\d)`, "u");
}

export function checkA7(d: SiteData): CheckOutcome {
  if (!d.facts) {
    return siteOutcome(d, "A7", [], { reason: "No business fact list was supplied.", nextStep: "Needs: your business fact list, including prices if you list any." }, "NOT_ASSESSED");
  }
  if (!d.facts.prices.length) {
    return siteOutcome(d, "A7", [], { reason: "Does not apply: the fact list has no prices.", nextStep: "Does not apply. If you do list prices on your site, add them to the fact list." }, "NOT_APPLICABLE");
  }
  type Item = { plan: string; amount: number; currency: string; pageUrl: string | null; status: "FOUND" | "NOT_FOUND" | "NOT_ASSESSED"; detail: string; excerpt?: string };
  const items: Item[] = [];
  for (const p of d.facts.prices) {
    const base = { plan: p.plan, amount: p.amount, currency: p.currency, pageUrl: p.pageUrl ?? null };
    if (!p.pageUrl) {
      items.push({ ...base, status: "NOT_ASSESSED", detail: `Needs: the URL of the page that lists the "${p.plan}" price (pageUrl in the fact list).` });
      continue;
    }
    const gate = htmlGate(d, p.pageUrl, { nonHtmlNotApplicable: false, checkLabel: "prices" });
    if ("result" in gate) {
      items.push({ ...base, status: "NOT_ASSESSED", detail: gate.result.reason });
      continue;
    }
    const text = visibleText(gate.obs.body);
    const m = priceRegex(p.amount).exec(text);
    if (m) {
      items.push({ ...base, status: "FOUND", detail: "found as text", excerpt: excerptAround(text, m.index, m[0].length, 60) });
      continue;
    }
    // Say why it is missing: only in the browser, or a different price in the structured data.
    const render = d.renders.get(p.pageUrl);
    const shownAfterJs = !!render && render.ok && priceRegex(p.amount).test(visibleText(render.html));
    const jsonLdPrices = [...gate.obs.body.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/g)].map((x) => Number(x[1]));
    const conflict = jsonLdPrices.length > 0 && !jsonLdPrices.includes(p.amount) ? ` The structured data on this page lists ${[...new Set(jsonLdPrices)].join(", ")} instead.` : "";
    const why = shownAfterJs ? `${p.amount} ${p.currency} is shown only after JavaScript runs, so it is missing from the HTML source.` : `${p.amount} ${p.currency} not found as text on ${p.pageUrl}.`;
    items.push({ ...base, status: "NOT_FOUND", detail: `${why}${conflict}` });
  }
  const nf = items.filter((i) => i.status === "NOT_FOUND");
  const na = items.filter((i) => i.status === "NOT_ASSESSED");
  if (nf.length) {
    return siteOutcome(
      d,
      "A7",
      [],
      { reason: `Price(s) not in the raw HTML: ${nf.map((i) => `${i.plan} (${i.amount} ${i.currency}) on ${i.pageUrl}. ${i.detail}`).join(" ")}`, nextStep: "Put the listed prices in the HTML response as text (not loaded by JavaScript or shown as images), and make the structured data match the visible prices.", data: { items } },
      "FAIL"
    );
  }
  if (na.length) return siteOutcome(d, "A7", [], { reason: `Could not check ${na.length} price(s).`, nextStep: na.map((i) => i.detail).join(" "), data: { items } }, "NOT_ASSESSED");
  return siteOutcome(d, "A7", [], { reason: `All ${items.length} listed price(s) are in the raw HTML as text.`, nextStep: null, data: { items } }, "PASS");
}

export function a7PagesToFetch(facts: FactList | null): string[] {
  return facts ? facts.prices.map((p) => p.pageUrl).filter((u): u is string => !!u) : [];
}

// ---------------------------------------------------------------------------
// A8. Canonical tag
// ---------------------------------------------------------------------------
export function checkA8(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  for (const url of checkedPages(d)) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "a canonical tag" });
    if ("result" in gate) {
      results.push(gate.result);
      continue;
    }
    const $ = loadHtml(gate.obs.body);
    const hrefs = $("link[rel]")
      .toArray()
      .filter((el) => ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"))
      .map((el) => ($(el).attr("href") ?? "").trim());
    const pageNorm = normalizeUrl(gate.obs.finalUrl, d.cfg.trackingParams);
    const resolved = hrefs.map((h) => ({ href: h, normalized: h ? normalizeUrl(h, d.cfg.trackingParams, gate.obs.finalUrl) : null }));
    const data = { pageUrl: gate.obs.finalUrl, pageNormalized: pageNorm, canonicals: resolved };
    if (hrefs.length === 0) {
      results.push(page(url, "FAIL", "There is no canonical tag.", `Add <link rel="canonical" href="${gate.obs.finalUrl}"> to the page head.`, ev(d, url, data, gate.obs.fetchedAt)));
    } else if (hrefs.length > 1) {
      results.push(page(url, "FAIL", `There are ${hrefs.length} canonical tags (${hrefs.join(", ")}).`, "Keep exactly one canonical tag.", ev(d, url, data, gate.obs.fetchedAt)));
    } else if (resolved[0].normalized !== pageNorm) {
      results.push(
        page(url, "FAIL", `The canonical tag points to ${resolved[0].href || "(empty)"}, not to this page (${gate.obs.finalUrl}).`, `Point the canonical tag to ${gate.obs.finalUrl}, unless this page is meant to be a duplicate.`, ev(d, url, data, gate.obs.fetchedAt))
      );
    } else {
      results.push(page(url, "PASS", "One canonical tag that points to this page.", null, ev(d, url, data, gate.obs.fetchedAt)));
    }
  }
  const s = pageSummary(results, "Every checked page has exactly one canonical tag pointing to itself.", "Canonical tag problems", "Fix the canonical tags listed for each page.");
  return siteOutcome(d, "A8", results, s);
}

// ---------------------------------------------------------------------------
// A9. No blocking tags
// ---------------------------------------------------------------------------
const BLOCK_DIRECTIVE = /(^|[\s,:;])(noindex|none)(?=$|[\s,;])/i;

export function checkA9(d: SiteData): CheckOutcome {
  const results: PageResult[] = [];
  const metaNames = new Set(["robots", ...d.cfg.aiCrawlers.map((c) => c.toLowerCase())]);
  for (const url of checkedPages(d)) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: false, checkLabel: "indexing tags" });
    if ("result" in gate) {
      results.push(gate.result);
      continue;
    }
    const header = gate.obs.headers["x-robots-tag"] ?? "";
    const found: string[] = [];
    if (header && BLOCK_DIRECTIVE.test(header)) found.push(`X-Robots-Tag header: "${header}"`);
    const metas: { name: string; content: string }[] = [];
    if (isHtmlContentType(gate.obs.contentType)) {
      const $ = loadHtml(gate.obs.body);
      $("meta[name]").each((_, el) => {
        const name = ($(el).attr("name") ?? "").toLowerCase();
        if (metaNames.has(name)) metas.push({ name, content: $(el).attr("content") ?? "" });
      });
    }
    for (const m of metas) if (BLOCK_DIRECTIVE.test(m.content)) found.push(`<meta name="${m.name}" content="${m.content}">`);
    const data = { xRobotsTag: header || null, robotsMetaTags: metas };
    if (found.length) {
      results.push(page(url, "FAIL", `Blocking directive found: ${found.join("; ")}.`, "Remove noindex/none from this page if you want AI tools and search engines to use it.", ev(d, url, data, gate.obs.fetchedAt)));
    } else {
      results.push(page(url, "PASS", "No noindex or none in meta robots tags or the X-Robots-Tag header.", null, ev(d, url, data, gate.obs.fetchedAt)));
    }
  }
  const s = pageSummary(results, "No checked page has a noindex or none directive.", "Blocking directives found", "Remove the noindex directives listed.");
  return siteOutcome(d, "A9", results, s);
}

// ---------------------------------------------------------------------------
// A10. Sitemap
// ---------------------------------------------------------------------------
export function checkA10(d: SiteData): CheckOutcome {
  const sm = d.sitemap;
  const homeRobots = d.robots.get(originOf(d.homepage));
  if (!sm) {
    return siteOutcome(d, "A10", [], { reason: "The sitemap was not loaded in this run.", nextStep: "Re-run the check; raise V2_MAX_REQUESTS_PER_CHECK if the request cap was reached." }, "NOT_ASSESSED");
  }
  const referenced: boolean | null = homeRobots?.kind === "PARSED" ? homeRobots.parsed.sitemaps.length > 0 : homeRobots?.kind === "NO_RULES" ? false : null;
  const startFiles = sm.files.filter((f) => f.depth === 0);
  const parsedFiles = sm.files.filter((f) => f.kind === "urlset" || f.kind === "sitemapindex");
  const invalid = sm.files.filter((f) => f.kind === "invalid");
  const data: Record<string, unknown> = { discoveredFrom: sm.discoveredFrom, referencedInRobots: referenced, files: sm.files, urlCount: sm.urls.length, keyPageSource: d.keyPageSource };
  const problems: string[] = [];
  const unknowns: string[] = [];
  const nexts: string[] = [];
  if (parsedFiles.length === 0) {
    const missing = startFiles.every((f) => f.kind === "unreachable" && f.status !== null && f.status >= 400 && f.status < 500 && f.status !== 429);
    if (invalid.length) {
      problems.push(`the sitemap does not parse (${invalid[0].url}: ${invalid[0].parseError})`);
      nexts.push("Fix the XML so it is a valid <urlset> or <sitemapindex>.");
    } else if (missing) {
      problems.push(`no sitemap was found (${startFiles.map((f) => `${f.url} returned HTTP ${f.status}`).join(", ")})`);
      nexts.push("Publish an XML sitemap that lists your key pages, and add a Sitemap: line to robots.txt.");
    } else {
      const f = startFiles[0];
      return siteOutcome(
        d,
        "A10",
        [],
        { reason: `The sitemap could not be reached (${f ? `${f.url}: ${f.outcome}${f.status ? " HTTP " + f.status : ""}` : "no file"}).`, nextStep: "Needs: the sitemap URL to respond (fix the server error or timeout), then re-test.", data },
        "NOT_ASSESSED"
      );
    }
  } else if (invalid.length) {
    problems.push(`${invalid.length} sitemap file(s) do not parse: ${invalid.map((f) => `${f.url} (${f.parseError})`).join("; ")}`);
    nexts.push("Fix the XML errors listed.");
  }
  if (referenced === false) {
    problems.push("robots.txt has no Sitemap: line");
    nexts.push(`Add "Sitemap: <your sitemap URL>" to robots.txt.`);
  } else if (referenced === null) {
    unknowns.push("whether robots.txt references the sitemap (robots.txt was not readable)");
  }
  const pages: PageResult[] = [];
  if (parsedFiles.length > 0) {
    if (sm.urls.length === 0 && !invalid.length) {
      problems.push("the sitemap lists no pages");
      nexts.push("List your key pages in the sitemap.");
    }
    const set = new Set(sm.urls);
    for (const kp of d.keyPages) {
      const o = d.pages.get(kp);
      const candidates = [normalizeUrl(kp, d.cfg.trackingParams), o && o.outcome === "OK" ? normalizeUrl(o.finalUrl, d.cfg.trackingParams) : null].filter((x): x is string => !!x);
      const listed = candidates.some((c) => set.has(c));
      const evidence = ev(d, kp, { candidates, listed, sitemapComplete: sm.complete });
      if (listed) pages.push(page(kp, "PASS", "Listed in the sitemap.", null, evidence));
      else if (sm.complete) pages.push(page(kp, "FAIL", "Not listed in the sitemap.", "Add this URL to the sitemap.", evidence));
      else pages.push(page(kp, "NOT_ASSESSED", "Not found in the sitemap files that were read, but some files could not be read.", "Needs: every sitemap file to load (see evidence), or a higher request cap.", evidence));
    }
    const missingPages = pages.filter((p) => p.status === "FAIL").map((p) => p.pageUrl);
    if (missingPages.length) {
      problems.push(`${missingPages.length} key page(s) are missing from the sitemap: ${missingPages.join(", ")}`);
      nexts.push("Add the missing key pages to the sitemap.");
    }
    const unread = pages.filter((p) => p.status === "NOT_ASSESSED").map((p) => p.pageUrl);
    if (unread.length) unknowns.push(`whether ${unread.length} key page(s) are listed (some sitemap files could not be read)`);
    if (d.keyPages.length === 0) unknowns.push("whether key pages are listed (no key pages were supplied and none came from the sitemap)");
  }
  data.keyPageResults = pages.map((p) => ({ url: p.pageUrl, status: p.status }));
  const note = d.keyPageSource === "sitemap" ? " Key pages were taken from the sitemap, so the key-page part of this check only confirms the sitemap parses." : "";
  if (problems.length) return siteOutcome(d, "A10", pages, { reason: `Problems: ${problems.join("; ")}.${note}`, nextStep: nexts.join(" "), data }, "FAIL");
  if (unknowns.length) {
    const needsKeyPages = d.keyPages.length === 0;
    return siteOutcome(d, "A10", pages, { reason: `Could not confirm ${unknowns.join("; ")}.${note}`, nextStep: needsKeyPages ? "Needs: the client's list of key pages." : "Re-run when robots.txt and all sitemap files load.", data }, "NOT_ASSESSED");
  }
  return siteOutcome(d, "A10", pages, { reason: `The sitemap parses, is referenced in robots.txt, and lists all ${d.keyPages.length} key page(s).${note}`, nextStep: null, data }, "PASS");
}

// ---------------------------------------------------------------------------
// A11. Key pages linked from the homepage
// ---------------------------------------------------------------------------
export function checkA11(d: SiteData): CheckOutcome {
  const home = d.pages.get(d.homepage);
  if (!home || home.outcome !== "OK" || home.status !== 200) {
    return siteOutcome(d, "A11", [], { reason: "The homepage could not be fetched, so links could not be followed.", nextStep: "Fix the homepage load (check A2), then re-test.", data: home ? { homepage: obsSummary(home) } : {} }, "NOT_ASSESSED");
  }
  if (d.keyPages.length === 0) {
    return siteOutcome(d, "A11", [], { reason: "There are no key pages to look for.", nextStep: "Needs: the client's list of key pages." }, "NOT_ASSESSED");
  }
  const crawl = d.linkCrawl;
  if (!crawl) return siteOutcome(d, "A11", [], { reason: "The link crawl did not run.", nextStep: "Re-run the check." }, "NOT_ASSESSED");
  const maxDepth = d.cfg.linkCrawlMaxDepth;
  const results: PageResult[] = [];
  for (const kp of d.keyPages) {
    const o = d.pages.get(kp);
    const candidates = [normalizeUrl(kp, d.cfg.trackingParams), o && o.outcome === "OK" ? normalizeUrl(o.finalUrl, d.cfg.trackingParams) : null].filter((x): x is string => !!x);
    const hit = candidates.find((c) => crawl.reached.has(c) && (crawl.reached.get(c) ?? 99) <= maxDepth);
    const data = { candidates, depth: hit ? crawl.reached.get(hit) : null, linkedFrom: hit ? crawl.via.get(hit) ?? null : null, crawlComplete: crawl.complete, pagesExpanded: crawl.pagesExpanded };
    if (hit) results.push(page(kp, "PASS", `Reached in ${crawl.reached.get(hit)} step(s) from the homepage${crawl.via.get(hit) ? ` (linked from ${crawl.via.get(hit)})` : ""}.`, null, ev(d, kp, data)));
    else if (crawl.complete) results.push(page(kp, "FAIL", `Not reached within ${maxDepth} steps of followable links from the homepage.`, "Link to this page from the homepage or the main navigation with a normal <a href> link (not nofollow, not JavaScript-only).", ev(d, kp, data)));
    else results.push(page(kp, "NOT_ASSESSED", `Not reached in the part of the site that could be crawled; ${crawl.gaps.length} page(s) could not be followed (first: ${crawl.gaps[0]?.url} - ${crawl.gaps[0]?.reason}).`, "Needs: a higher V2_MAX_REQUESTS_PER_CHECK, or a direct link from the homepage.", ev(d, kp, { ...data, gaps: crawl.gaps.slice(0, 10) })));
  }
  const s = pageSummary(results, `Every key page is reachable within ${maxDepth} steps from the homepage.`, "Key pages not linked", "Add normal links to the pages listed.");
  return siteOutcome(d, "A11", results, { ...s, data: { crawlComplete: crawl.complete, pagesExpanded: crawl.pagesExpanded, gaps: crawl.gaps.slice(0, 20) } });
}

// ---------------------------------------------------------------------------
// A12. Structured data
// ---------------------------------------------------------------------------
export function checkA12(d: SiteData): CheckOutcome {
  if (d.facts && d.facts.usesStructuredData === false) {
    return siteOutcome(d, "A12", [], { reason: "Does not apply: the fact list confirms this business type does not use structured data.", nextStep: "Does not apply. Change usesStructuredData in the fact list if this is wrong." }, "NOT_APPLICABLE");
  }
  const results: PageResult[] = [];
  const withoutBlocks: string[] = [];
  const unassessed: PageResult[] = [];
  let totalBlocks = 0;
  for (const url of checkedPages(d)) {
    const gate = htmlGate(d, url, { nonHtmlNotApplicable: true, checkLabel: "structured data" });
    if ("result" in gate) {
      if (gate.result.status === "NOT_ASSESSED") unassessed.push(gate.result);
      results.push(gate.result);
      continue;
    }
    const $ = loadHtml(gate.obs.body);
    const blocks = $("script")
      .toArray()
      .filter((el) => ($(el).attr("type") ?? "").toLowerCase().split(";")[0].trim() === "application/ld+json")
      .map((el) => $(el).html() ?? "");
    if (blocks.length === 0) {
      withoutBlocks.push(url);
      continue;
    }
    totalBlocks += blocks.length;
    const parsed = blocks.map((b, i) => {
      try {
        const v = JSON.parse(b.trim());
        const types = ([] as unknown[]).concat(v).flatMap((x) => (x && typeof x === "object" ? ([] as unknown[]).concat((x as Record<string, unknown>)["@type"] ?? [], ((x as Record<string, unknown>)["@graph"] as Record<string, unknown>[] | undefined)?.map((g) => g["@type"]) ?? []) : []));
        return { block: i + 1, ok: true as const, types: types.filter(Boolean).map(String) };
      } catch (e) {
        return { block: i + 1, ok: false as const, error: (e as Error).message, excerpt: b.trim().slice(0, 200) };
      }
    });
    const bad = parsed.filter((p) => !p.ok);
    const data = { blocks: parsed };
    // Template placeholders (for example DYNAMIC_URL) are replaced by a script in the browser only.
    const placeholders = [...new Set(blocks.flatMap((b) => b.match(/DYNAMIC_[A-Z_]+/g) ?? []))];
    if (bad.length) results.push(page(url, "FAIL", `${bad.length} of ${blocks.length} JSON-LD block(s) fail to parse.`, "Fix the JSON syntax in the listed blocks.", ev(d, url, data, gate.obs.fetchedAt)));
    else if (placeholders.length) results.push(page(url, "FAIL", `JSON-LD contains template placeholders (${placeholders.join(", ")}). A script fills them in only in the browser, so crawlers read invalid values.`, "Write the real page URL, name and description into the JSON-LD in the server HTML.", ev(d, url, { ...data, placeholders }, gate.obs.fetchedAt)));
    else results.push(page(url, "PASS", `${blocks.length} JSON-LD block(s), all parse and contain no template placeholders.`, null, ev(d, url, data, gate.obs.fetchedAt)));
  }
  const fails = results.filter((r) => r.status === "FAIL");
  const data = { totalBlocks, pagesWithoutJsonLd: withoutBlocks };
  if (fails.length) return siteOutcome(d, "A12", results, { reason: `Structured data problems on: ${fails.map((f) => `${f.pageUrl} (${f.reason.replace(/\.$/, "")})`).join("; ")}.`, nextStep: "Fix the JSON errors and placeholders listed for each page.", data }, "FAIL");
  if (unassessed.length) return siteOutcome(d, "A12", results, { reason: `${unassessed.length} page(s) could not be read, so not every block could be checked.`, nextStep: unassessed[0].nextStep, data }, "NOT_ASSESSED");
  if (totalBlocks === 0) {
    if (results.length > 0 && results.every((r) => r.status === "NOT_APPLICABLE")) return siteOutcome(d, "A12", results, { reason: "Does not apply: no checked page is an HTML page.", nextStep: "Does not apply; no action needed.", data }, "NOT_APPLICABLE");
    return siteOutcome(d, "A12", results, { reason: "No JSON-LD structured data on the homepage or any key page.", nextStep: "Add JSON-LD (for example Organization on the homepage, Product or Service on key pages). If your business type does not use structured data, set usesStructuredData to false in the fact list.", data }, "FAIL");
  }
  return siteOutcome(d, "A12", results, { reason: `${totalBlocks} JSON-LD block(s) found; all parse.${withoutBlocks.length ? ` ${withoutBlocks.length} page(s) have none: ${withoutBlocks.join(", ")}.` : ""}`, nextStep: null, data }, "PASS");
}

export const CHECKS: Record<CheckId, (d: SiteData) => CheckOutcome> = {
  A1: checkA1,
  A2: checkA2,
  A3: checkA3,
  A4: checkA4,
  A5: checkA5,
  A6: checkA6,
  A7: checkA7,
  A8: checkA8,
  A9: checkA9,
  A10: checkA10,
  A11: checkA11,
  A12: checkA12,
};

export { countWords, escapeRegex };
