import { load } from "cheerio";
import { URL } from "url";
import {
  Ctx,
  Signal,
  Group,
  RobotsState,
  CORE_AGENTS,
  GROUNDING_TOKEN,
  NEUTRAL_UA,
  ROUNDS,
  ROUND_SPACING_MS,
  MIN_OBSERVATION_SPAN_MS,
  CRAWL_DEPTH,
  CONCURRENCY,
  Fetched,
  fetchPage,
  fetchWithRetry,
  isUsable,
  isOk,
  mapLimit,
  round1,
  scored,
  diagnostic,
  rulesFor,
  isAllowed,
  anchorSet,
  robotsBlocks,
  normUrl,
  resolveUrl,
  sleep,
} from "./core";

// ---------------------------------------------------------------------------
// E1.01 - Effective Crawl Access (scored 14%, tier B simulated probe)
// Score = 100 x usable / known outcomes. Robots decision is stored separately from the network outcome.
// Transient or unknown outcomes stay unknown (never 0). Soft-404 and wrong content type are not usable.
// ---------------------------------------------------------------------------
interface PairRow {
  agent: string;
  url: string;
  control: string;
  status: number;
  kind: string;
  robots: string;
  outcome: number | null;
  note: string;
  retries: number;
}

export function isSoft404(f: { transport: boolean; status: number; body: string }): boolean {
  if (f.transport || f.status < 200 || f.status >= 300) return false;
  const head = f.body.slice(0, 20000);
  const title = ((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "") as string;
  const h1 = ((head.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") as string;
  return /404|not found|page not found|does not exist/i.test(title + " " + h1);
}

export async function evaluateE101(urls: string[], robots: RobotsState): Promise<Signal> {
  const perUrl = await mapLimit(urls, CONCURRENCY, async (url) => {
    const control = await fetchWithRetry(url, NEUTRAL_UA);
    return Promise.all(
      CORE_AGENTS.map(async (agent): Promise<PairRow> => {
        const r = await fetchWithRetry(url, agent.ua);
        const policyKnown = robots.mode === "parsed";
        const policyBlocked = policyKnown && robotsBlocks(robots, agent.token, url);
        const soft = r.kind === "usable" && isSoft404(r.f);
        let outcome: number | null = null;
        let note = "";
        if (r.kind === "usable" && !soft) {
          outcome = 1;
          note = policyBlocked ? "usable; robots.txt disallows this agent (policy/network disagreement)" : "usable";
        } else if (r.kind === "blocked" || soft) {
          if (control.kind === "usable") {
            outcome = 0;
            note = soft ? "soft-404 for this agent (neutral control usable)" : "agent-specific block (neutral control usable)";
          } else {
            note = "origin-wide failure (neutral control also failed); unknown";
          }
        } else {
          note = "transient after retries; unknown";
        }
        return {
          agent: agent.id,
          url,
          control: control.kind,
          status: r.f.status,
          kind: soft ? "soft-404" : r.kind,
          robots: policyKnown ? (policyBlocked ? "disallowed" : "allowed") : "unknown",
          outcome,
          note,
          retries: r.retries,
        };
      })
    );
  });

  const rows: PairRow[] = [];
  for (const group of perUrl) for (const row of group) rows.push(row);

  const planned = rows.length;
  const known = rows.filter((r) => r.outcome !== null);
  const usable = known.filter((r) => r.outcome === 1).length;
  const blockedAgents: string[] = [];
  for (const r of known) {
    if (r.outcome === 0 && blockedAgents.indexOf(r.agent) < 0) blockedAgents.push(r.agent);
  }
  const coverage = planned ? round1((known.length / planned) * 100) : 0;
  const score = known.length ? round1((usable / known.length) * 100) : null;
  const disallowed = rows.filter((r) => r.robots === "disallowed").length;
  const disagreements = rows.filter((r) => r.outcome === 1 && r.robots === "disallowed").length;
  const soft404 = rows.filter((r) => r.kind === "soft-404").length;

  return scored(
    "E1.01",
    score,
    score === null ? "UNASSESSED" : known.length === planned ? "ASSESSED" : "PARTIAL",
    coverage >= 90 ? "high" : coverage >= 50 ? "medium" : "low",
    {
      urls_tested: urls.length,
      pairs_planned: planned,
      pairs_known: known.length,
      known_outcome_coverage: `${coverage}%`,
      usable_pairs: usable,
      agent_specific_blocks: blockedAgents.length ? blockedAgents.join(", ") : "none",
      robots_disallowed_pairs: disallowed,
      policy_network_disagreements: disagreements,
      soft_404_pairs: soft404,
      evidence_tier: "B-simulated probe (configured client identity; provider-side logs not observed)",
    },
    score === null
      ? "No known URL-agent outcomes. Origin-wide or transient failures are not scored."
      : `${usable} of ${known.length} known URL-agent outcomes were usable (${planned} planned pairs, ${coverage}% known). This is a probe result, not proof that any named provider fetched the pages.`,
    score === null
      ? "Retest; the site could not be evaluated for any agent."
      : blockedAgents.length
      ? `Review CDN/WAF rules for ${blockedAgents.join(", ")}. Allow only the crawlers you intend to serve.`
      : "No agent-specific blocks observed in the probe.",
    rows
  );
}

// ---------------------------------------------------------------------------
// E1.02 - Crawler Policy by Class (scored 14%, tier A deterministic)
// Score = 0.70 x Search + 0.20 x User-fetch + 0.10 x Grounding (handbook v1.0 class weights).
// If robots.txt is unavailable or ambiguous the signal is UNASSESSED, never 100 or 0.
// ---------------------------------------------------------------------------
export function evaluateE102(ctx: Ctx): Signal {
  const robots = ctx.robots;
  if (robots.mode === "policy_unavailable") {
    return scored(
      "E1.02",
      null,
      "UNASSESSED",
      "low",
      {
        robots_url: `https://${ctx.domain}/robots.txt`,
        robots_http_status: robots.f.transport ? "transport error" : robots.f.status,
        robots_mode: robots.mode,
        robots_fetch_retries: robots.retries,
        robots_basis: "unavailable (missing evidence, not a verified block)",
        evidence_tier: "A-deterministic",
      },
      "robots.txt was unreachable or returned a 5xx or 429 after retries. This is missing evidence, not a verified block, so no score is given.",
      "Make robots.txt reliably available (200 or 404) and retest."
    );
  }

  const paths = ctx.urls.map((u) => {
    const x = new URL(u);
    return x.pathname + x.search;
  });
  const classes = [
    { name: "search", weight: 0.7, tokens: CORE_AGENTS.filter((a) => a.cls === "search").map((a) => a.token) },
    { name: "user_fetch", weight: 0.2, tokens: CORE_AGENTS.filter((a) => a.cls === "user-fetch").map((a) => a.token) },
    { name: "grounding", weight: 0.1, tokens: [GROUNDING_TOKEN] },
  ];

  const classScores: Record<string, number> = {};
  let engine = 0;
  let pairs = 0;
  for (const cls of classes) {
    let allowed = 0;
    let total = 0;
    for (const token of cls.tokens) {
      const groups: Group[] = robots.groups;
      const rules = robots.mode === "parsed" ? rulesFor(groups, token) : null;
      for (const p of paths) {
        total++;
        const ok = robots.mode === "parsed" ? isAllowed(rules, p) : true;
        if (ok) allowed++;
      }
    }
    pairs += total;
    const score = total ? (allowed / total) * 100 : 0;
    classScores[cls.name] = round1(score);
    engine += cls.weight * score;
  }
  const score = round1(engine);

  return scored(
    "E1.02",
    score,
    "ASSESSED",
    "high",
    {
      robots_url: `https://${ctx.domain}/robots.txt`,
      robots_http_status: robots.f.transport ? "transport error" : robots.f.status,
      robots_mode: robots.mode,
      robots_fetch_retries: robots.retries,
      robots_basis: robots.mode === "parsed" ? "verified robots.txt rules" : "no robots.txt restrictions (4xx)",
      search_class_score: classScores.search,
      user_fetch_class_score: classScores.user_fetch,
      grounding_class_score: classScores.grounding,
      retrieval_search_only_score: classScores.search,
      class_weights: "70/20/10 (handbook v1.0; differs from workbook v1.1, open decision)",
      pairs_evaluated: pairs,
      evidence_tier: "A-deterministic",
    },
    `Search (${classScores.search}%) x 0.7 + User-fetch (${classScores.user_fetch}%) x 0.2 + Grounding (${classScores.grounding}%) x 0.1 = ${score}. Policy is not authentication and does not prove indexing or citation.`,
    score >= 90
      ? "robots.txt allows the scored crawlers."
      : "Review robots.txt for unintended blocks of search and user-fetch crawlers, and decide deliberately on Google-Extended."
  );
}

// ---------------------------------------------------------------------------
// E1.03 - Retrieval Response Reliability (scored 8%, tier A/B repeated sampling)
// Score = 100 x usable attempts / all attempts. Each attempt has exactly one outcome class.
// A score is given only when the observed span between first and last round meets the minimum window.
// ---------------------------------------------------------------------------
function attemptOutcome(f: Fetched, soft: boolean): string {
  if (f.transport) return "timeout_or_transport";
  if (soft) return "soft_404";
  if (f.status === 429) return "rate_limited";
  if (f.status >= 500) return "server_error";
  if (f.status >= 400) return "client_error";
  if (isUsable(f)) return "usable";
  return "invalid_body";
}

export async function evaluateE103(urls: string[]): Promise<Signal> {
  const attempts: { round: number; url: string; at: number; status: number; outcome: string }[] = [];
  const roundTimes: number[] = [];
  let anyResponse = false;

  for (let round = 1; round <= ROUNDS; round++) {
    if (round > 1 && ROUND_SPACING_MS > 0) await sleep(ROUND_SPACING_MS);
    roundTimes.push(Date.now());
    const results = await mapLimit(urls, CONCURRENCY, (url) => fetchPage(url, NEUTRAL_UA));
    for (let i = 0; i < urls.length; i++) {
      const f = results[i];
      if (!f.transport) anyResponse = true;
      const soft = !f.transport && isSoft404(f);
      attempts.push({ round, url: urls[i], at: Date.now(), status: f.status, outcome: attemptOutcome(f, soft) });
    }
  }

  if (!anyResponse) {
    return scored(
      "E1.03",
      null,
      "UNASSESSED",
      "low",
      { rounds: ROUNDS, evidence_tier: "A/B-repeated-sampling" },
      "No response from the site in any round; cannot separate a Besignitics-side failure from a site outage.",
      "Retest when the site is reachable.",
      attempts
    );
  }

  const counts: Record<string, number> = {};
  for (const a of attempts) counts[a.outcome] = (counts[a.outcome] || 0) + 1;
  const usableAttempts = counts.usable || 0;
  const attemptPct = round1((usableAttempts / attempts.length) * 100);
  const span = roundTimes.length > 1 ? roundTimes[roundTimes.length - 1] - roundTimes[0] : 0;
  const windowMet = span >= MIN_OBSERVATION_SPAN_MS;
  const outcomeEvidence = {
    attempts_total: attempts.length,
    attempts_usable: usableAttempts,
    outcome_timeout_or_transport: counts.timeout_or_transport || 0,
    outcome_rate_limited: counts.rate_limited || 0,
    outcome_server_error: counts.server_error || 0,
    outcome_client_error: counts.client_error || 0,
    outcome_soft_404: counts.soft_404 || 0,
    outcome_invalid_body: counts.invalid_body || 0,
    rounds: ROUNDS,
    observed_span_seconds: Math.round(span / 1000),
    evidence_tier: "A/B-repeated-sampling",
  };

  if (!windowMet) {
    return scored(
      "E1.03",
      null,
      "PARTIAL",
      "medium",
      {
        ...outcomeEvidence,
        observation_window: `not met (minimum ${Math.round(MIN_OBSERVATION_SPAN_MS / 1000)} seconds between first and last round)`,
        immediate_sample_usable_pct: attemptPct,
      },
      `Immediate sample: ${attemptPct}% of attempts were usable across ${ROUNDS} rounds run ${Math.round(span / 1000)} seconds apart. Reliability is temporal, so this sample cannot support a reliability score and none is given.`,
      "Repeat the test over a window of at least one hour (set E1_ROUND_SPACING_MS) before publishing a reliability score.",
      attempts
    );
  }

  return scored(
    "E1.03",
    attemptPct,
    "ASSESSED",
    "high",
    { ...outcomeEvidence, observation_window: "met" },
    `${usableAttempts} of ${attempts.length} attempts were usable across ${ROUNDS} rounds spaced over the observation window.`,
    attemptPct >= 90
      ? "Response reliability is strong for the tested URLs over the observation window."
      : "Fix recurring failures, rate limits and soft-404 pages on the tested URLs, then retest the same sample.",
    attempts
  );
}

// ---------------------------------------------------------------------------
// E1.04 - Sitemap Discoverability (diagnostic, weight 0)
// lastmod is optional. Its absence is not a sitemap defect.
// ---------------------------------------------------------------------------
export function evaluateE104(ctx: Ctx): Signal {
  const s = ctx.sitemaps;
  const validFiles = s.files.filter((f) => f.valid).length;
  const listed = Object.keys(s.listed);
  const importantListed = ctx.urls.filter((u) => s.listed[u]).length;
  const withLastmod = listed.filter((u) => s.lastmod[u]).length;
  const parseErrors = s.files.reduce((t, f) => t + f.errors.length, 0);
  return diagnostic(
    "E1.04",
    "DIAGNOSTIC",
    {
      sitemap_files_checked: s.files.length,
      valid_sitemap_files: validFiles,
      unique_urls_listed: listed.length,
      important_urls_listed_pct: round1(ctx.urls.length ? (importantListed / ctx.urls.length) * 100 : 0),
      lastmod_coverage_pct: round1(listed.length ? (withLastmod / listed.length) * 100 : 0),
      parse_errors: parseErrors,
      evidence_tier: "A-deterministic",
    },
    validFiles
      ? `${validFiles} valid sitemap file(s) list ${listed.length} URLs. Merged into E1.07; no independent weight.`
      : "No valid sitemap found via robots.txt or /sitemap.xml. Merged into E1.07; no independent weight.",
    validFiles
      ? "Keep the sitemap current and reference it in robots.txt. lastmod is optional."
      : "Publish a valid sitemap.xml and reference it in robots.txt."
  );
}

// ---------------------------------------------------------------------------
// E1.05 - Important Page Discoverability (diagnostic, inventory quality, weight 0)
// ---------------------------------------------------------------------------
export function evaluateE105(ctx: Ctx, hashFn: (s: string) => string): Signal {
  const reviewed = ctx.customerUrlCount > 0;
  return diagnostic(
    "E1.05",
    "DIAGNOSTIC",
    {
      evidence_tier: reviewed ? "Customer-supplied (not reviewed)" : "Automated inventory (human review not performed)",
      inventory_size: ctx.urls.length,
      customer_urls: ctx.customerUrlCount,
      inventory_sources: ctx.inventoryNote,
      human_review: "not performed",
      inventory_hash: hashFn(ctx.urls.join("\n")),
    },
    reviewed
      ? "Inventory includes customer-supplied URLs, but no human review was recorded. The E1.07 denominator is provisional."
      : "The important-URL inventory is automated and has not been reviewed by a human. The E1.07 denominator is provisional and not comprehensive.",
    "Confirm the important-URL list with the customer and add critical pages missing from the sitemap.",
    "low"
  );
}

// ---------------------------------------------------------------------------
// E1.06 - Internal Link Discoverability (diagnostic, raw HTML link paths, weight 0)
// ---------------------------------------------------------------------------
export async function evaluateE106(ctx: Ctx): Promise<Signal> {
  if (ctx.crawl.error) {
    return diagnostic(
      "E1.06",
      "UNASSESSED",
      { evidence_tier: "A-deterministic", reason: ctx.crawl.error },
      "Crawl outage; link paths cannot be determined.",
      "Retest when the homepage is reachable.",
      "low"
    );
  }

  const depths: number[] = [];
  let linkPathCount = 0;
  let sitemapOnly = 0;
  let both = 0;
  let nofollowOnly = 0;
  let none = 0;
  for (const u of ctx.urls) {
    const d = ctx.crawl.depth[u];
    const hasLink = d !== undefined && d <= CRAWL_DEPTH && !!ctx.crawl.pages[u];
    const hasSitemap = !!ctx.sitemaps.listed[u];
    if (hasLink) {
      linkPathCount++;
      depths.push(d);
    }
    if (hasLink && hasSitemap) both++;
    else if (hasSitemap) sitemapOnly++;
    else if (!hasLink && ctx.crawl.nofollowTargets[u]) nofollowOnly++;
    if (!hasLink && !hasSitemap) none++;
  }

  const sorted = depths.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : -1;
  const maxDepth = sorted.length ? sorted[sorted.length - 1] : -1;

  let jsOnlyLinks: string | number = "not measured (no browser)";
  const renderedHome = ctx.render.pages[ctx.home];
  if (ctx.render.available && renderedHome && ctx.pages[ctx.home]) {
    const raw = anchorSet(ctx.pages[ctx.home].body, ctx.home);
    const rendered = anchorSet(renderedHome.html, ctx.home);
    let count = 0;
    rendered.forEach((u) => {
      if (!raw.has(u)) count++;
    });
    jsOnlyLinks = count;
  }

  const n = ctx.urls.length || 1;
  return diagnostic(
    "E1.06",
    "DIAGNOSTIC",
    {
      important_urls_with_link_path_pct: round1((linkPathCount / n) * 100),
      median_depth: median,
      max_depth: maxDepth,
      sitemap_only: sitemapOnly,
      link_and_sitemap: both,
      nofollow_only: nofollowOnly,
      no_valid_path: none,
      broken_links_crawled: ctx.crawl.brokenLinks,
      broken_edges_excluded: ctx.crawl.brokenLinks,
      js_only_links_homepage: jsOnlyLinks,
      evidence_tier: "A-deterministic (raw HTML only)",
    },
    `${linkPathCount} of ${ctx.urls.length} important URLs have a raw-HTML link path within ${CRAWL_DEPTH} hops. Broken edges are excluded. JS-only links are not measured without a browser. Merged into E1.07; no independent weight.`,
    none ? "Add server-rendered navigation or hub links to every important URL, or list it in the sitemap." : "Link paths are in place for all important URLs."
  );
}

// ---------------------------------------------------------------------------
// E1.07 - Retrieval Path Coverage (scored 12%)
// Score = 100 x eligible important URLs with a verified path / eligible important URLs.
// Eligible = fetched OK and not blocked for Googlebot by robots.txt.
// A path qualifies only if the page's canonical points to the page itself (or is absent).
// Sitemap-only paths qualify but are counted and labelled.
// Without a customer-supplied inventory the signal is PARTIAL (provisional denominator).
// ---------------------------------------------------------------------------
export function evaluateE107(ctx: Ctx): Signal {
  if (ctx.urls.length === 0 || ctx.crawl.error) {
    return scored(
      "E1.07",
      null,
      "UNASSESSED",
      "low",
      { evidence_tier: "A-deterministic", reason: ctx.crawl.error || "empty inventory" },
      "Path coverage cannot be measured without a defined inventory and a crawlable homepage.",
      "Define the important-URL list and make the homepage reachable."
    );
  }

  let eligible = 0;
  let valid = 0;
  let sitemapOnly = 0;
  let canonicalMismatch = 0;
  let robotsExcluded = 0;
  let fetchFailed = 0;
  for (const u of ctx.urls) {
    const page = ctx.pages[u];
    if (!isOk(page)) {
      fetchFailed++;
      continue;
    }
    if (robotsBlocks(ctx.robots, "Googlebot", u)) {
      robotsExcluded++;
      continue;
    }
    eligible++;
    const canonRaw = load(page.body)('link[rel="canonical"]').first().attr("href");
    const canon = canonRaw ? resolveUrl(canonRaw, u) : "";
    if (canon && canon !== normUrl(u)) {
      canonicalMismatch++;
      continue;
    }
    const d = ctx.crawl.depth[u];
    const hasLink = d !== undefined && d <= CRAWL_DEPTH && !!ctx.crawl.pages[u];
    const listed = !!ctx.sitemaps.listed[u];
    if (hasLink || listed) {
      valid++;
      if (!hasLink && listed) sitemapOnly++;
    }
  }

  if (eligible === 0) {
    return scored(
      "E1.07",
      null,
      "UNASSESSED",
      "low",
      { important_urls: ctx.urls.length, fetch_failed: fetchFailed, robots_excluded: robotsExcluded, evidence_tier: "A-deterministic" },
      "No important URL is both fetchable and eligible, so path coverage cannot be scored.",
      "Make the important URLs reachable and allowed for Googlebot, then retest."
    );
  }

  const score = round1((valid / eligible) * 100);
  const provisional = ctx.customerUrlCount === 0;
  return scored(
    "E1.07",
    score,
    provisional ? "PARTIAL" : "ASSESSED",
    provisional ? "low" : "medium",
    {
      important_urls: ctx.urls.length,
      eligible_urls: eligible,
      urls_with_valid_path: valid,
      sitemap_only_paths: sitemapOnly,
      canonical_mismatch: canonicalMismatch,
      robots_excluded: robotsExcluded,
      fetch_failed: fetchFailed,
      inventory_sources: ctx.inventoryNote,
      inventory_status: provisional ? "automated, not reviewed (provisional)" : "customer-supplied (not reviewed)",
      evidence_tier: "A-deterministic (inventory-dependent)",
    },
    `${valid} of ${eligible} eligible important URLs have a verified discovery path (raw link within ${CRAWL_DEPTH} hops or valid sitemap; ${sitemapOnly} sitemap-only).${
      provisional ? " The inventory is automated, so this score is provisional." : ""
    }`,
    score >= 90
      ? "Discovery paths are in place for the important URLs."
      : "Prioritise important URLs with no valid path: add raw-HTML links from navigation or hub pages, and list them in the sitemap."
  );
}
