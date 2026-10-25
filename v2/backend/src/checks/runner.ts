import { CheckConfig, checkVersion } from "../config";
import { FactList } from "../facts/types";
import { a6PagesToFetch, a7PagesToFetch, CHECKS, LinkCrawlResult, SiteData } from "./checks";
import { FetcherDeps, PoliteFetcher } from "./fetcher";
import { extractLinks, isHtmlContentType } from "./html";
import { Renderer } from "./renderer";
import { loadSitemaps } from "./sitemap";
import { CheckOutcome, CHECK_IDS, HttpObservation } from "./types";
import { isInternal, normalizeUrl, originOf } from "./url";

export interface CheckRunInput {
  homepage: string;
  /** Client key pages. Empty = take them from the sitemap. */
  keyPages: string[];
  facts: FactList | null;
}

export interface CheckRunOutput {
  checkVersion: string;
  config: CheckConfig;
  startedAt: string;
  finishedAt: string;
  homepage: string;
  keyPages: string[];
  keyPageSource: "client" | "sitemap" | "none";
  requestsUsed: number;
  requestCap: number;
  budgetNotes: string[];
  requestLog: { url: string; status: number | null; at: string; purpose: string }[];
  outcomes: CheckOutcome[];
}

/** Upper-bound request plan, used for the estimate returned when a run starts. */
export function planRequests(cfg: CheckConfig, keyPageCount: number, renderingAvailable: boolean): { planned: number; estimatedSeconds: number; warnings: string[] } {
  const pages = 1 + Math.min(keyPageCount, cfg.maxKeyPages);
  const robots = 1;
  const sitemap = 1;
  const firstFetch = pages;
  const repeats = pages * (cfg.pageLoadAttempts - 1);
  const renders = renderingAvailable ? pages : 0;
  const crawlAllowance = 5;
  const planned = robots + sitemap + firstFetch + repeats + renders + crawlAllowance;
  const used = Math.min(planned, cfg.maxRequestsPerCheck);
  const estimatedSeconds = Math.ceil((used * (cfg.requestDelayMs + 800)) / 1000 + (renderingAvailable ? pages * 3 : 0));
  const warnings: string[] = [];
  if (planned > cfg.maxRequestsPerCheck) {
    warnings.push(
      `This run needs about ${planned} requests but the cap is ${cfg.maxRequestsPerCheck}. Requests are spent in this order: robots.txt, homepage, sitemap, key pages, A2 repeat loads, A3 renders, link crawl. Checks that run out of requests show NOT_ASSESSED with the reason.`
    );
  }
  return { planned, estimatedSeconds, warnings };
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * Runs all 12 checks. Request budget is spent in priority order so that the most basic
 * observations are made first. Every check then runs as a pure function of what was observed.
 */
export async function runChecks(input: CheckRunInput, cfg: CheckConfig, deps: FetcherDeps, renderer: Renderer): Promise<CheckRunOutput> {
  const version = checkVersion(cfg);
  const startedAt = deps.now().toISOString();
  const fetcher = new PoliteFetcher(cfg, deps);
  const notes: string[] = [];
  const homepage = input.homepage;
  const trackingParams = cfg.trackingParams;
  const homeNorm = normalizeUrl(homepage, trackingParams);

  // 1. robots.txt for the homepage origin (also decides whether we may fetch anything).
  await fetcher.loadRobots(originOf(homepage));

  // 2. Homepage.
  const pages = new Map<string, HttpObservation>();
  pages.set(homepage, await fetcher.fetchPage(homepage, "homepage"));

  // 3. Key pages: client list, or the sitemap.
  const robotsState = fetcher.robotsStateFor(originOf(homepage));
  const robotsSitemaps = robotsState?.kind === "PARSED" ? robotsState.parsed.sitemaps : [];
  let sitemap: SiteData["sitemap"] = null;
  let keyPages = dedupe(input.keyPages.filter((u) => normalizeUrl(u, trackingParams) !== homeNorm)).slice(0, cfg.maxKeyPages);
  let keyPageSource: CheckRunOutput["keyPageSource"] = keyPages.length ? "client" : "none";
  if (input.keyPages.length > cfg.maxKeyPages) notes.push(`Only the first ${cfg.maxKeyPages} key pages were checked (V2_MAX_KEY_PAGES).`);
  if (!keyPages.length) {
    sitemap = await loadSitemaps(fetcher, homepage, robotsSitemaps, cfg);
    const fromSitemap = dedupe(sitemap.orderedRawUrls.filter((u) => isInternal(u, homepage) && normalizeUrl(u, trackingParams) !== homeNorm)).slice(0, cfg.maxKeyPages);
    if (fromSitemap.length) {
      keyPages = fromSitemap;
      keyPageSource = "sitemap";
      notes.push(`No key page list was supplied; the first ${fromSitemap.length} page(s) in the sitemap were used.`);
    } else {
      notes.push("No key page list was supplied and the sitemap gave none; only the homepage was checked. Needs: the client's list of key pages.");
    }
  }

  // 4. First fetch of each key page.
  for (const kp of keyPages) pages.set(kp, await fetcher.fetchPage(kp, "key-page"));

  // 5. Extra pages for A6 (contact page) and A7 (price pages).
  for (const extra of dedupe([...a6PagesToFetch({ homepage, keyPages, facts: input.facts }), ...a7PagesToFetch(input.facts)])) {
    if (!pages.has(extra)) pages.set(extra, await fetcher.fetchPage(extra, "fact-page"));
  }

  // 6. Sitemap, if not loaded yet.
  if (!sitemap) sitemap = await loadSitemaps(fetcher, homepage, robotsSitemaps, cfg);

  // 7. A2 repeat attempts, round-robin so a short budget is shared evenly.
  const checked = [homepage, ...keyPages];
  const attempts = new Map<string, HttpObservation[]>();
  for (const u of checked) attempts.set(u, [pages.get(u)!]);
  for (let attemptNo = 2; attemptNo <= cfg.pageLoadAttempts; attemptNo++) {
    for (const u of checked) {
      if (fetcher.budgetRemaining === 0) break;
      const first = pages.get(u)!;
      if (first.outcome === "ROBOTS_BLOCKED") continue;
      attempts.get(u)!.push(await fetcher.fetchPage(u, `load-attempt-${attemptNo}`, { useCache: false }));
    }
  }

  // 8. A3 renders.
  const renders: SiteData["renders"] = new Map();
  const unavailable = await renderer.probe();
  for (const u of checked) {
    const o = pages.get(u)!;
    if (o.outcome !== "OK" || o.status !== 200 || !isHtmlContentType(o.contentType)) continue;
    if (unavailable) {
      renders.set(u, { ok: false, kind: "NOT_INSTALLED", message: unavailable });
      continue;
    }
    const permit = await fetcher.reserveRender(o.finalUrl);
    if (!permit.ok) {
      renders.set(u, { ok: false, kind: "SKIPPED", message: permit.reason });
      continue;
    }
    renders.set(u, await renderer.render(o.finalUrl));
  }
  await renderer.close();

  // 9. A11 link crawl, breadth-first, cached pages first, then fetch with what is left of the budget.
  const linkCrawl = await crawlLinks(fetcher, homepage, keyPages, pages, cfg);

  const observedAt = deps.now().toISOString();
  const siteData: SiteData = {
    checkVersion: version,
    cfg,
    homepage,
    keyPages,
    keyPageSource,
    facts: input.facts,
    robots: new Map(
      [originOf(homepage), ...checked.map(originOf)].filter((o, i, a) => a.indexOf(o) === i).flatMap((o) => {
        const s = fetcher.robotsStateFor(o);
        return s ? [[o, s] as const] : [];
      })
    ),
    pages,
    attempts,
    renders,
    sitemap,
    linkCrawl,
    observedAt,
  };
  if (fetcher.budgetRemaining === 0) notes.push(`The request cap of ${cfg.maxRequestsPerCheck} was reached. Checks without enough observations are NOT_ASSESSED.`);
  const outcomes = CHECK_IDS.map((id) => CHECKS[id](siteData));
  return {
    checkVersion: version,
    config: cfg,
    startedAt,
    finishedAt: deps.now().toISOString(),
    homepage,
    keyPages,
    keyPageSource,
    requestsUsed: fetcher.requestsUsed,
    requestCap: cfg.maxRequestsPerCheck,
    budgetNotes: notes,
    requestLog: fetcher.log,
    outcomes,
  };
}

async function crawlLinks(fetcher: PoliteFetcher, homepage: string, keyPages: string[], pages: Map<string, HttpObservation>, cfg: CheckConfig): Promise<LinkCrawlResult | null> {
  const tp = cfg.trackingParams;
  const home = pages.get(homepage);
  if (!home || home.outcome !== "OK" || home.status !== 200) return null;
  // Observations by normalized URL (requested and final), so cached pages are reused.
  const byNorm = new Map<string, HttpObservation>();
  for (const o of pages.values()) {
    if (o.outcome !== "OK") continue;
    for (const u of [o.requestedUrl, o.finalUrl]) {
      const n = normalizeUrl(u, tp);
      if (n && !byNorm.has(n)) byNorm.set(n, o);
    }
  }
  const targets = new Set(keyPages.flatMap((k) => [normalizeUrl(k, tp), pages.get(k)?.outcome === "OK" ? normalizeUrl(pages.get(k)!.finalUrl, tp) : null]).filter((x): x is string => !!x));
  const reached = new Map<string, number>();
  const via = new Map<string, string>();
  const gaps: LinkCrawlResult["gaps"] = [];
  const homeN = normalizeUrl(home.finalUrl, tp)!;
  reached.set(homeN, 0);
  reached.set(normalizeUrl(homepage, tp)!, 0);
  let frontier: string[] = [homeN];
  let expanded = 0;
  const allFound = () => [...targets].every((t) => reached.has(t));
  for (let depth = 0; depth < cfg.linkCrawlMaxDepth && frontier.length && !allFound(); depth++) {
    // Cached pages first so a tight budget is not wasted.
    const ordered = [...frontier].sort((a, b) => Number(byNorm.has(b)) - Number(byNorm.has(a)));
    const next: string[] = [];
    for (const nodeUrl of ordered) {
      if (allFound()) break;
      let obs = byNorm.get(nodeUrl);
      if (!obs) {
        if (fetcher.budgetRemaining === 0) {
          gaps.push({ url: nodeUrl, depth, reason: "request cap reached" });
          continue;
        }
        obs = await fetcher.fetchPage(nodeUrl, "link-crawl");
        if (obs.outcome === "OK") {
          const fn = normalizeUrl(obs.finalUrl, tp);
          if (fn) byNorm.set(fn, obs);
        }
        byNorm.set(nodeUrl, obs);
      }
      if (obs.outcome !== "OK" || obs.status !== 200) {
        if (obs.outcome !== "OK" || (obs.status !== null && obs.status >= 500) || obs.status === 429) {
          gaps.push({ url: nodeUrl, depth, reason: obs.outcome !== "OK" ? `${obs.outcome}${obs.error ? ": " + obs.error : ""}` : `HTTP ${obs.status}` });
        }
        continue; // 4xx pages have no links to follow; that is an observation, not a gap
      }
      if (!isHtmlContentType(obs.contentType)) continue;
      expanded += 1;
      const finalN = normalizeUrl(obs.finalUrl, tp);
      if (finalN && !reached.has(finalN)) reached.set(finalN, depth);
      for (const link of extractLinks(obs.body, obs.finalUrl)) {
        if (link.nofollow || !isInternal(link.resolved, homepage)) continue;
        const n = normalizeUrl(link.resolved, tp);
        if (!n || reached.has(n)) continue;
        reached.set(n, depth + 1);
        via.set(n, obs.finalUrl);
        next.push(n);
      }
    }
    frontier = next;
  }
  return { reached, via, complete: gaps.length === 0, gaps, pagesExpanded: expanded };
}
