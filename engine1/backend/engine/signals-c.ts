import { load } from "cheerio";
import { URL } from "url";
import {
  Ctx,
  Signal,
  Fetched,
  NEUTRAL_UA,
  INDEXNOW_KEY,
  isOk,
  fetchPage,
  hashText,
  resolveUrl,
  normUrl,
  normalizeText,
  tokens,
  jaccard,
  visibleText,
  robotsBlocks,
  round1,
  scored,
} from "./core";

function splitDirectivesText(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------
export function metaCanonical(html: string, base: string): string {
  const $ = load(html);
  return resolveUrl($('link[rel="canonical"]').first().attr("href"), base);
}

export function metaDirectives(html: string): { name: string; content: string }[] {
  const $ = load(html);
  const out: { name: string; content: string }[] = [];
  $("meta[name]").each((_, el) => {
    const name = ($(el).attr("name") || "").toLowerCase();
    if (name === "robots" || name === "googlebot" || name === "bingbot") {
      out.push({ name, content: $(el).attr("content") || "" });
    }
  });
  return out;
}

export function hostVariants(url: string, domain: string): string[] {
  const u = new URL(url);
  const path = u.pathname + u.search;
  const altHost = domain.indexOf("www.") === 0 ? domain.slice(4) : "www." + domain;
  return [`http://${domain}${path}`, `https://${altHost}${path}`];
}

// ---------------------------------------------------------------------------
// E1.13 - Canonical & Duplicate Resolution (scored 5%)
// Subchecks: C1 HTML vs header canonical conflict; C2 target not 200; C3 target noindex or robots-blocked;
// C4 target similarity < 0.60; C5 canonical only after JS (needs browser); C6 host/protocol variant serves a 200.
// Score = 100 x URLs with no declared-signal conflict / assessed URLs.
// Without a browser C5 is not assessed, so the signal is PARTIAL and says so.
// ---------------------------------------------------------------------------
export async function evaluateE113(ctx: Ctx): Promise<Signal> {
  let assessed = 0;
  let clean = 0;
  let unassessed = 0;
  const counts: Record<string, number> = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 };
  const conflictRows: string[] = [];

  for (const url of ctx.urls) {
    const page: Fetched | undefined = ctx.pages[url];
    if (!isOk(page)) {
      unassessed++;
      continue;
    }
    assessed++;
    const conflicts: string[] = [];
    const flag = (code: string): void => {
      conflicts.push(code);
      counts[code]++;
    };
    const htmlCanon = metaCanonical(page.body, url);
    const hdr = /<([^>]+)>\s*;\s*rel="?canonical"?/i.exec(page.headers["link"] || "");
    const headerCanon = hdr ? resolveUrl(hdr[1], url) : "";
    const target = htmlCanon || headerCanon;

    if (htmlCanon && headerCanon && htmlCanon !== headerCanon) flag("C1");

    if (target && target !== normUrl(url)) {
      const t = await fetchPage(target, NEUTRAL_UA, false);
      if (!isOk(t)) {
        flag("C2");
      } else {
        const noindex = metaDirectives(t.body).some(
          (d) => (d.name === "robots" || d.name === "googlebot") && /noindex|none/i.test(d.content)
        );
        const blocked = ctx.robots.mode === "parsed" && robotsBlocks(ctx.robots, "Googlebot", target);
        if (noindex || blocked) flag("C3");
        const sim = jaccard(tokens(visibleText(page.body)), tokens(visibleText(t.body)));
        if (sim < 0.6) flag("C4");
      }
    }

    if (ctx.render.available) {
      const rendered = ctx.render.pages[url];
      if (rendered && rendered.html && !htmlCanon && metaCanonical(rendered.html, url)) flag("C5");
    }

    for (const variant of hostVariants(url, ctx.domain)) {
      const v = await fetchPage(variant, NEUTRAL_UA, false);
      if (isOk(v)) {
        flag("C6");
        break;
      }
    }

    if (conflicts.length === 0) clean++;
    else conflictRows.push(`${url}: ${conflicts.join(",")}`);
  }

  if (assessed === 0) {
    return scored(
      "E1.13",
      null,
      "UNASSESSED",
      "low",
      { evidence_tier: "A-deterministic", reason: "no inventory page could be fetched" },
      "Canonical signals cannot be assessed without a fetchable page.",
      "Make the important pages reachable and retest."
    );
  }

  const score = round1((clean / assessed) * 100);
  const c5Status = ctx.render.available ? "assessed" : "not assessed (no browser)";
  const partial = unassessed > 0 || !ctx.render.available;
  return scored(
    "E1.13",
    score,
    partial ? "PARTIAL" : "ASSESSED",
    partial ? "medium" : "high",
    {
      urls_assessed: assessed,
      urls_without_conflict: clean,
      urls_unassessed: unassessed,
      conflicts_C1: counts.C1,
      conflicts_C2: counts.C2,
      conflicts_C3: counts.C3,
      conflicts_C4: counts.C4,
      conflicts_C5: counts.C5,
      conflicts_C6: counts.C6,
      C5_status: c5Status,
      conflict_sample: conflictRows.slice(0, 10).join(" | ") || "none",
      evidence_tier: "A-deterministic",
    },
    `${clean} of ${assessed} assessed URLs have no declared-signal conflict observed. C5 is ${c5Status}.${
      unassessed > 0 ? ` ${unassessed} URL(s) could not be fetched.` : ""
    } This is not proof that a search engine selected the intended canonical.`,
    conflictRows.length
      ? "Make canonical tags consistent, point them to 200 indexable URLs, and redirect host and protocol variants."
      : "No declared-signal canonical conflict was observed."
  );
}

// ---------------------------------------------------------------------------
// E1.14 - Index & Snippet Eligibility (scored 8%)
// Scope: declared directives only (robots meta, X-Robots-Tag, unavailable_after, data-nosnippet).
// Not index presence and not metadata quality. Per URL x engine (Google, Bing).
// Score = 100 x eligible pairs / assessed pairs.
// ---------------------------------------------------------------------------
export function collectDirectives(
  html: string,
  headerValue: string
): { generic: string[]; byAgent: Record<string, string[]>; dataNosnippetCovers: boolean } {
  const generic: string[] = [];
  const byAgent: Record<string, string[]> = { googlebot: [], bingbot: [] };
  const addItem = (item: string): void => {
    const m = /^(googlebot|bingbot|google)\s*:\s*(.+)$/i.exec(item);
    if (m) {
      const key = m[1].toLowerCase() === "bingbot" ? "bingbot" : "googlebot";
      byAgent[key].push(m[2]);
    } else {
      generic.push(item);
    }
  };
  splitDirectivesText(headerValue).forEach(addItem);
  for (const d of metaDirectives(html)) {
    if (d.name === "robots") splitDirectivesText(d.content).forEach(addItem);
    else if (d.name === "googlebot") byAgent.googlebot.push(...splitDirectivesText(d.content));
    else if (d.name === "bingbot") byAgent.bingbot.push(...splitDirectivesText(d.content));
  }

  const $ = load(html);
  const h1 = normalizeText($("h1").first().text());
  const priceRe = /[$€£]\s?\d/;
  let dataNosnippetCovers = false;
  $("[data-nosnippet]").each((_, el) => {
    const t = normalizeText($(el).text());
    if (!t) return;
    if ((h1 && t.indexOf(h1) >= 0) || priceRe.test(t)) dataNosnippetCovers = true;
  });
  return { generic, byAgent, dataNosnippetCovers };
}

export async function evaluateE114(ctx: Ctx): Promise<Signal> {
  let assessedUrls = 0;
  let unassessed = 0;
  let eligible = 0;
  let pairs = 0;
  const blockedRows: string[] = [];
  const now = Date.now();
  const engines = [
    { name: "Google", agent: "googlebot", token: "Googlebot" },
    { name: "Bing", agent: "bingbot", token: "Bingbot" },
  ];

  for (const url of ctx.urls) {
    const page = ctx.pages[url];
    if (!isOk(page) || engines.some((e) => robotsBlocks(ctx.robots, e.token, url))) {
      unassessed++;
      continue;
    }
    assessedUrls++;
    const dirs = collectDirectives(page.body, page.headers["x-robots-tag"] || "");

    for (const eng of engines) {
      const list = dirs.generic.concat(dirs.byAgent[eng.agent]);
      const reasons: string[] = [];
      for (const d of list) {
        const low = d.toLowerCase();
        if (/(^|\s)(noindex|none)(\s|$)/.test(low)) reasons.push("index-blocked");
        if (/(^|\s)nosnippet(\s|$)/.test(low) || /max-snippet:\s*0(\s|$)/.test(low)) reasons.push("snippet-blocked");
        const ua = /unavailable_after:\s*(.+)$/i.exec(d);
        if (ua) {
          const t = Date.parse(ua[1].trim());
          if (!isNaN(t) && t < now) reasons.push("index-blocked (expired)");
        }
      }
      if (eng.agent === "googlebot" && dirs.dataNosnippetCovers) {
        reasons.push("snippet-blocked (data-nosnippet on critical unit)");
      }
      pairs++;
      if (reasons.length === 0) eligible++;
      else blockedRows.push(`${url} [${eng.name}]: ${reasons.join(", ")}`);
    }
  }

  if (pairs === 0) {
    return scored(
      "E1.14",
      null,
      "UNASSESSED",
      "low",
      { evidence_tier: "A-deterministic", reason: "directives unreadable for all URLs" },
      "Directives could not be read for any important URL (fetch failure or robots.txt block).",
      "Make the URLs fetchable and allowed for Googlebot and Bingbot, then retest."
    );
  }

  const score = round1((eligible / pairs) * 100);
  return scored(
    "E1.14",
    score,
    unassessed > 0 ? "PARTIAL" : "ASSESSED",
    "high",
    {
      scope: "declared directives only (not index presence, not metadata quality)",
      urls_assessed: assessedUrls,
      urls_unassessed: unassessed,
      engine_pairs: pairs,
      eligible_pairs: eligible,
      blocked_pairs: blockedRows.slice(0, 10).join(" | ") || "none",
      evidence_tier: "A-deterministic",
    },
    `${eligible} of ${pairs} URL x engine pairs carry no declared index or snippet restriction. This does not show that any page is indexed or cited.`,
    score >= 100
      ? "No declared index or snippet restrictions on the tested URLs."
      : "Remove accidental noindex, nosnippet or expired availability directives on important URLs."
  );
}

// ---------------------------------------------------------------------------
// E1.15 - Content Update Detectability (scored 3%, conditional)
// Score = 100 x (0.30 L + 0.20 H + 0.35 A + 0.15 I), only when all four components are assessed.
// A needs at least two stored audits (not yet stored). I needs E1_INDEXNOW_KEY.
// A missing component is never scored as zero. Until all four are available the signal is PARTIAL with no score.
// ---------------------------------------------------------------------------
export function isTimeSensitive(url: string): boolean {
  return /\/(pric(e|es|ing)|news|events?|press|releases?|products?|docs?|changelog|policy|policies|privacy|terms|availability)(\/|$|[-_])/i.test(
    new URL(url).pathname
  );
}

// Snapshot of the previous audit for one domain: content hash and lastmod per URL.
export interface UrlSnapshot {
  hash: string;
  lastmod: string;
}
export type Snapshot = Record<string, UrlSnapshot>;

export async function evaluateE115(ctx: Ctx, previous?: Snapshot): Promise<Signal> {
  const ts = ctx.urls.filter((u) => isTimeSensitive(u));
  if (ts.length === 0) {
    return scored(
      "E1.15",
      null,
      "N/A",
      "high",
      { evidence_tier: "A-deterministic", time_sensitive_urls: 0 },
      "No time-sensitive pages in the inventory; this signal does not apply.",
      "No action required for evergreen pages."
    );
  }

  const dated = ts.filter((u) => ctx.sitemaps.lastmod[u] && !isNaN(Date.parse(ctx.sitemaps.lastmod[u])));
  const L = dated.length / ts.length;
  const now = Date.now();
  const dates = dated.map((u) => ctx.sitemaps.lastmod[u].slice(0, 10));
  const future = dated.some((u) => Date.parse(ctx.sitemaps.lastmod[u]) > now + 86400000);
  const counts: Record<string, number> = {};
  for (const d of dates) counts[d] = (counts[d] || 0) + 1;
  const topShare = dates.length ? Math.max(...Object.keys(counts).map((k) => counts[k])) / dates.length : 0;
  const H = future || (dates.length >= 2 && topShare >= 0.9) ? 0 : 1;

  // A: lastmod honesty across two audits. A time-sensitive URL matches when its content changed and
  // its lastmod changed, or when neither changed. A needs a previous audit of the same domain.
  let A: number | null = null;
  let compared = 0;
  if (previous) {
    let matched = 0;
    for (const u of ts) {
      const p = previous[u];
      const cur = ctx.pages[u];
      if (!p || !isOk(cur)) continue;
      compared++;
      const contentChanged = hashText(visibleText(cur.body)) !== p.hash;
      const lastmodChanged = (ctx.sitemaps.lastmod[u] || "") !== p.lastmod;
      if (contentChanged === lastmodChanged) matched++;
    }
    if (compared > 0) A = matched / compared;
  }

  let I: number | null = null;
  if (INDEXNOW_KEY) {
    const kf = await fetchPage(`https://${ctx.domain}/${INDEXNOW_KEY}.txt`, NEUTRAL_UA);
    I = isOk(kf) && kf.body.trim() === INDEXNOW_KEY ? 1 : 0;
  }

  const comps: { name: string; w: number; v: number | null }[] = [
    { name: "L", w: 0.3, v: L },
    { name: "H", w: 0.2, v: H },
    { name: "A", w: 0.35, v: A },
    { name: "I", w: 0.15, v: I },
  ];
  const used = comps.filter((c) => c.v !== null);
  const wsum = used.reduce((t, c) => t + c.w, 0);
  const normalised = round1((100 * used.reduce((t, c) => t + c.w * (c.v as number), 0)) / wsum);
  const missing = comps.filter((c) => c.v === null).map((c) => c.name);

  const evidence = {
    time_sensitive_urls: ts.length,
    lastmod_valid_pct: round1(L * 100),
    honesty_component_H: H,
    indexnow_component_I: I === null ? "not assessed (set E1_INDEXNOW_KEY)" : I,
    accuracy_component_A: A === null ? "not assessed (needs a previous audit of this domain)" : round1(A * 100) / 100,
    urls_compared_with_previous_audit: compared,
    components_missing: missing.join(", ") || "none",
    evidence_tier: "A-deterministic",
  };

  if (missing.length > 0) {
    return scored(
      "E1.15",
      null,
      "PARTIAL",
      "low",
      { ...evidence, provisional_normalised_score: normalised },
      `Only ${used.length} of 4 components are assessed (${used.map((c) => c.name).join(", ")}). Missing components are not scored as zero, so no score is given.`,
      "Run the audit a second time to assess accuracy (A), and set E1_INDEXNOW_KEY to assess IndexNow (I)."
    );
  }

  return scored(
    "E1.15",
    normalised,
    "ASSESSED",
    "medium",
    evidence,
    `Score ${normalised} from all four components.`,
    normalised >= 90 ? "Lastmod values reflect real content changes." : "Generate lastmod from real content changes for time-sensitive URLs and keep it accurate."
  );
}

// ---------------------------------------------------------------------------
// E1.16 - Search Index Presence (scored 4%, conditional, first-party only)
// Requires an authorised Google Search Console or Bing Webmaster Tools connection. Never scored as zero.
// ---------------------------------------------------------------------------
export function evaluateE116(): Signal {
  return scored(
    "E1.16",
    null,
    "UNASSESSED",
    "low",
    { evidence_tier: "C-first-party", console: "not connected" },
    "No authorised Google Search Console or Bing Webmaster Tools connection; index status cannot be verified. Not scored as zero.",
    "Connect a first-party console to measure index presence for the important URLs."
  );
}
