import { load } from "cheerio";
import { URL } from "url";
import {
  Ctx,
  Signal,
  BROWSER_TIMEOUT_MS,
  isOk,
  visibleText,
  tokens,
  overlap,
  shingleSet,
  jaccard,
  normalizeText,
  round1,
  scored,
  diagnostic,
} from "./core";

// ---------------------------------------------------------------------------
// Shared key-unit helpers
// ---------------------------------------------------------------------------
interface KeyUnit {
  text: string;
  weight: number;
  kind: string;
}

// A reference content unit supplied by the customer or reviewer (E1.09). Weight defaults to 1.
export interface ContentUnitRef {
  url: string;
  text: string;
  weight?: number;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Key units from rendered DOM (E1.09 diagnostic): title, h1, headings, paragraphs (>= 8 tokens), prices
export function keyUnitsFromRendered(html: string): KeyUnit[] {
  const $ = load(html);
  $("script, style, noscript").remove();
  const units: KeyUnit[] = [];
  const title = cleanText($("title").first().text());
  if (title) units.push({ text: title, weight: 2, kind: "title" });
  $("h1").each((_, el) => {
    const t = cleanText($(el).text());
    if (t) units.push({ text: t, weight: 2, kind: "h1" });
  });
  $("h2, h3").each((_, el) => {
    const t = cleanText($(el).text());
    if (t) units.push({ text: t, weight: 1, kind: "heading" });
  });
  $("p").each((_, el) => {
    const t = cleanText($(el).text());
    if (tokens(t).length >= 8) units.push({ text: t, weight: 1, kind: "paragraph" });
  });
  const prices = $("body").text().match(/[$€£]\s?\d[\d,.]*/g) || [];
  const seen: Record<string, boolean> = {};
  for (const p of prices) {
    if (seen[p]) continue;
    seen[p] = true;
    units.push({ text: p, weight: 2, kind: "price" });
  }
  return units;
}

// Key units from raw HTML (E1.10): headings and paragraphs
export function keyUnitsFromRaw(html: string): KeyUnit[] {
  const $ = load(html);
  $("script, style, noscript, template").remove();
  const units: KeyUnit[] = [];
  $("h1").each((_, el) => {
    const t = cleanText($(el).text());
    if (t) units.push({ text: t, weight: 2, kind: "h1" });
  });
  $("h2, h3").each((_, el) => {
    const t = cleanText($(el).text());
    if (t) units.push({ text: t, weight: 1, kind: "heading" });
  });
  $("p").each((_, el) => {
    const t = cleanText($(el).text());
    if (tokens(t).length >= 8) units.push({ text: t, weight: 1, kind: "paragraph" });
  });
  return units;
}

// ---------------------------------------------------------------------------
// E1.08 - Content Rendering Accessibility (diagnostic, browser observation, weight 0)
// ---------------------------------------------------------------------------
export function evaluateE108(ctx: Ctx, renderedOnlyUnits: number): Signal {
  if (!ctx.render.available) {
    return diagnostic(
      "E1.08",
      "UNASSESSED",
      { evidence_tier: "A-browser observation", reason: ctx.render.reason },
      "Headless browser not available, so rendering was not observed.",
      "Install Playwright Chromium on the server (see setup steps) and retest.",
      "low"
    );
  }
  const pages = Object.keys(ctx.render.pages).map((k) => ctx.render.pages[k]);
  const ok = pages.filter((p) => p.html.length > 0 && !p.timedOut).length;
  const timeouts = pages.filter((p) => p.timedOut).length;
  const consoleErrors = pages.reduce((t, p) => t + p.consoleErrors, 0);
  const failed = pages.reduce((t, p) => t + p.failedRequests, 0);
  return diagnostic(
    "E1.08",
    "DIAGNOSTIC",
    {
      browser_version: ctx.render.version,
      pages_rendered: pages.length,
      render_success_rate_pct: round1(pages.length ? (ok / pages.length) * 100 : 0),
      timeouts,
      console_errors: consoleErrors,
      failed_requests: failed,
      rendered_only_units: renderedOnlyUnits,
      evidence_tier: "A-browser observation",
    },
    `${ok} of ${pages.length} pages rendered within ${BROWSER_TIMEOUT_MS / 1000} seconds. Render success is not proof that AI crawlers execute JavaScript.`,
    renderedOnlyUnits > 0
      ? "Move key content into server-delivered HTML (see E1.09 recommendations)."
      : "No key content depends on JavaScript for the tested pages."
  );
}

// ---------------------------------------------------------------------------
// E1.09 - Server-Delivered Content Parity (scored 18%)
// Scored construct: initial-HTML availability. Share of reference content units found in the raw HTML,
// weighted by unit weight, then page-importance weighted (home = 2, others = 1).
// Requires a versioned reference inventory of content units. Without one the signal is UNASSESSED.
// Browser parity (rendered-only units) is reported as a diagnostic only.
// ---------------------------------------------------------------------------
export function evaluateE109(ctx: Ctx, reference: ContentUnitRef[]): { signal: Signal; renderedOnly: number } {
  let renderedOnly = 0;
  if (ctx.render.available) {
    for (const url of ctx.urls) {
      const raw = ctx.pages[url];
      const rendered = ctx.render.pages[url];
      if (!isOk(raw) || !rendered || !rendered.html) continue;
      const pool = new Set(tokens(visibleText(raw.body)));
      for (const unit of keyUnitsFromRendered(rendered.html)) {
        if (overlap(unit.text, pool) < 0.9) renderedOnly++;
      }
    }
  }
  const parityDiagnostic: string | number = ctx.render.available ? renderedOnly : "not measured (no browser)";

  if (reference.length === 0) {
    return {
      signal: scored(
        "E1.09",
        null,
        "UNASSESSED",
        "low",
        {
          evidence_tier: "A-deterministic",
          reference_units: 0,
          parity_diagnostic_rendered_only_units: parityDiagnostic,
          reason: "no reference content-unit inventory supplied",
        },
        "Initial-HTML content availability needs a versioned reference inventory of critical content units. None was supplied, so no score is given. Browser parity is reported separately as a diagnostic.",
        "Supply the critical headings, prices and paragraphs for each important URL as contentUnits in the audit request, then re-run."
      ),
      renderedOnly,
    };
  }

  const byUrl: Record<string, ContentUnitRef[]> = {};
  for (const r of reference) {
    if (!r || !r.url || !r.text) continue;
    (byUrl[r.url] = byUrl[r.url] || []).push(r);
  }
  const referencedUrls = Object.keys(byUrl);

  const rows: { url: string; parity: number; weight: number; units: number; absent: number }[] = [];
  for (const url of referencedUrls) {
    const raw = ctx.pages[url];
    if (!isOk(raw)) continue;
    const pool = new Set(tokens(visibleText(raw.body)));
    let num = 0;
    let den = 0;
    let absent = 0;
    for (const unit of byUrl[url]) {
      const w = unit.weight ?? 1;
      den += w;
      if (overlap(unit.text, pool) >= 0.9) num += w;
      else absent++;
    }
    rows.push({ url, parity: den ? num / den : 0, weight: url === ctx.home ? 2 : 1, units: byUrl[url].length, absent });
  }

  if (rows.length === 0) {
    return {
      signal: scored(
        "E1.09",
        null,
        "UNASSESSED",
        "low",
        {
          evidence_tier: "A-deterministic",
          reference_urls: referencedUrls.length,
          reason: "no referenced URL could be fetched",
          parity_diagnostic_rendered_only_units: parityDiagnostic,
        },
        "None of the referenced URLs could be fetched, so initial-HTML availability cannot be scored.",
        "Make the referenced URLs reachable and retest."
      ),
      renderedOnly,
    };
  }

  const wsum = rows.reduce((t, p) => t + p.weight, 0);
  const site = round1((rows.reduce((t, p) => t + p.parity * p.weight, 0) / wsum) * 100);
  const unassessedUrls = referencedUrls.length - rows.length;
  const totalUnits = rows.reduce((t, p) => t + p.units, 0);
  const absentTotal = rows.reduce((t, p) => t + p.absent, 0);

  return {
    signal: scored(
      "E1.09",
      site,
      unassessedUrls > 0 ? "PARTIAL" : "ASSESSED",
      "medium",
      {
        reference_version: "customer-supplied-v1",
        reference_urls: referencedUrls.length,
        pages_assessed: rows.length,
        pages_unassessed: unassessedUrls,
        reference_units_checked: totalUnits,
        units_absent_from_raw_html: absentTotal,
        match_threshold: "token overlap >= 0.90",
        parity_diagnostic_rendered_only_units: parityDiagnostic,
        evidence_tier: "A-deterministic (reference inventory)",
      },
      `Initial-HTML availability ${site}% of reference content units across ${rows.length} page(s); ${absentTotal} unit(s) absent from server-delivered HTML.`,
      site >= 90
        ? "Reference content is present in server-delivered HTML."
        : "Move the missing headings, prices and paragraphs into server-delivered HTML, then retest the same URLs."
    ),
    renderedOnly,
  };
}

// ---------------------------------------------------------------------------
// E1.10 - Content Extractability (scored 8%, proxy, unvalidated)
// Page score = 100 x (0.80 x recall + 0.20 x (1 - boilerplate share)), mean of two extractors.
// The score is a proxy. Extractor agreement is not extraction accuracy, so the signal stays PARTIAL until validated.
// ---------------------------------------------------------------------------
export function hasExtractors(): boolean {
  try {
    require("jsdom");
    require("@mozilla/readability");
    return true;
  } catch {
    return false;
  }
}

export function readabilityText(html: string, url: string): string {
  try {
    const { JSDOM } = require("jsdom");
    const { Readability } = require("@mozilla/readability");
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    return article && article.textContent ? String(article.textContent) : "";
  } catch {
    return "";
  }
}

export function heuristicText(html: string): string {
  const $ = load(html);
  $("script, style, nav, header, footer, aside, noscript, template, form").remove();
  const main = $("main, article, [role=main]").first();
  return (main.length ? main : $("body")).text();
}

export function evaluateE110(ctx: Ctx): Signal {
  if (!hasExtractors()) {
    return scored(
      "E1.10",
      null,
      "UNASSESSED",
      "low",
      { evidence_tier: "D-proxy", reason: "jsdom and @mozilla/readability not installed" },
      "Extractor proxy cannot run without its extractors.",
      "Install jsdom and @mozilla/readability on the server (see setup steps)."
    );
  }

  const crawled = Object.keys(ctx.crawl.pages).map((k) => ctx.crawl.pages[k]);
  const docs = crawled.map((p) => shingleSet(visibleText(p.html)));
  const counts: Record<string, number> = {};
  for (const set of docs) {
    set.forEach((sh) => {
      counts[sh] = (counts[sh] || 0) + 1;
    });
  }
  const threshold = Math.ceil(docs.length * 0.5);
  const isBoilerplate = (sh: string): boolean => docs.length >= 2 && (counts[sh] || 0) >= threshold;

  const rows: { url: string; score: number; weight: number; agreement: number }[] = [];
  for (const url of ctx.urls) {
    const raw = ctx.pages[url];
    if (!isOk(raw)) continue;
    const units = keyUnitsFromRaw(raw.body);
    if (units.length === 0) continue;
    const readText = readabilityText(raw.body, url);
    const heurText = heuristicText(raw.body);
    const extractorScores = [readText, heurText].map((text) => {
      const pool = new Set(tokens(text));
      let num = 0;
      let den = 0;
      for (const unit of units) {
        den += unit.weight;
        if (overlap(unit.text, pool) >= 0.9) num += unit.weight;
      }
      const recall = den ? num / den : 0;
      const sh = shingleSet(text);
      let boiler = 0;
      sh.forEach((s) => {
        if (isBoilerplate(s)) boiler++;
      });
      const share = sh.size ? boiler / sh.size : 0;
      return 100 * (0.8 * recall + 0.2 * (1 - share));
    });
    const pageScore = (extractorScores[0] + extractorScores[1]) / 2;
    rows.push({
      url,
      score: pageScore,
      weight: url === ctx.home ? 2 : 1,
      agreement: jaccard(tokens(readText), tokens(heurText)),
    });
  }

  if (rows.length === 0) {
    return scored(
      "E1.10",
      null,
      "N/A",
      "high",
      { evidence_tier: "D-proxy", reason: "no key units in raw HTML" },
      "No key units exist in raw HTML; E1.09 owns that failure.",
      "Add server-delivered headings and paragraphs."
    );
  }

  const wsum = rows.reduce((t, r) => t + r.weight, 0);
  const score = round1(rows.reduce((t, r) => t + r.score * r.weight, 0) / wsum);
  const meanAgreement = rows.reduce((t, r) => t + r.agreement, 0) / rows.length;
  const band = meanAgreement >= 0.7 ? "High" : meanAgreement >= 0.5 ? "Medium" : "Low";

  return scored(
    "E1.10",
    score,
    "PARTIAL",
    "low",
    {
      pages_scored: rows.length,
      mean_extractor_agreement: round1(meanAgreement * 100) / 100,
      agreement_band: band,
      boilerplate_pages_used: docs.length,
      boilerplate_measured: docs.length >= 2 ? "yes" : "no (fewer than 2 pages crawled)",
      validation: "not performed (no human-labelled benchmark)",
      evidence_tier: "D-proxy (unvalidated)",
    },
    `Proxy score ${score}. It measures how the two extractors and the recall heuristic agree on this page, not extraction accuracy. Agreement is ${band.toLowerCase()}. Not validated against labelled main content.`,
    score >= 90
      ? "Main content is extractable from the raw HTML (proxy). Validate with a labelled benchmark before relying on this score."
      : "Use clear main content with headings, lists and paragraphs, and reduce repeated boilerplate."
  );
}

// ---------------------------------------------------------------------------
// Schema helpers (E1.11, E1.12)
// ---------------------------------------------------------------------------
export interface SchemaNode {
  type: string;
  obj: any;
  source: string;
}

export function extractSchema(html: string): { nodes: SchemaNode[]; jsonldErrors: number; propNames: Record<string, boolean> } {
  const $ = load(html);
  const nodes: SchemaNode[] = [];
  const propNames: Record<string, boolean> = {};
  let jsonldErrors = 0;

  const walk = (node: any): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node["@graph"]) walk(node["@graph"]);
    const t = node["@type"];
    const types: string[] = Array.isArray(t) ? t : t ? [t] : [];
    for (const ty of types) {
      if (typeof ty === "string") nodes.push({ type: ty, obj: node, source: "jsonld" });
    }
    for (const k of Object.keys(node)) propNames[k] = true;
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {
      jsonldErrors++;
    }
  });
  $("[itemtype]").each((_, el) => {
    const ty = ($(el).attr("itemtype") || "").split("/").pop() || "";
    if (ty) nodes.push({ type: ty, obj: null, source: "microdata" });
  });
  $("[itemprop]").each((_, el) => {
    propNames[$(el).attr("itemprop") || ""] = true;
  });
  $("[typeof]").each((_, el) => {
    const ty = ($(el).attr("typeof") || "").split(/\s+/)[0];
    if (ty) nodes.push({ type: ty, obj: null, source: "rdfa" });
  });
  $("[property]").each((_, el) => {
    propNames[$(el).attr("property") || ""] = true;
  });
  return { nodes, jsonldErrors, propNames };
}

export function hasType(nodes: SchemaNode[], expected: string[]): boolean {
  return nodes.some((n) => expected.indexOf(n.type) >= 0);
}

export const ROLE_TYPES: Record<string, string[]> = {
  home: ["Organization", "LocalBusiness", "Corporation"],
  article: ["Article", "BlogPosting", "NewsArticle"],
  product: ["Product"],
};

export const ROLE_REQUIRED: Record<string, string[]> = {
  home: ["name", "url"],
  article: ["headline", "datePublished", "author"],
  product: ["name", "offers"],
};

export function pageRole(url: string): string {
  const path = new URL(url).pathname;
  if (path === "/" || path === "") return "home";
  if (/\/(blog|article|articles|news|post|posts|insights|stories)(\/|$)/i.test(path)) return "article";
  if (/\/(product|products|shop|store|item)(\/|$)/i.test(path)) return "product";
  return "other";
}

function propOk(obj: any, prop: string): boolean {
  if (!obj) return false;
  const v = obj[prop];
  if (v === undefined || v === null || v === "") return false;
  if (prop === "offers") {
    const o = Array.isArray(v) ? v[0] : v;
    return !!o && typeof o === "object" && o.price !== undefined && o.priceCurrency !== undefined;
  }
  return true;
}

// ---------------------------------------------------------------------------
// E1.11 - Structured Data Coverage (diagnostic, weight 0)
// ---------------------------------------------------------------------------
export function evaluateE111(ctx: Ctx): Signal {
  let applicable = 0;
  let covered = 0;
  let jsOnly = 0;
  let unassessed = 0;
  for (const url of ctx.urls) {
    const role = pageRole(url);
    if (role === "other") continue;
    const raw = ctx.pages[url];
    if (!isOk(raw)) {
      unassessed++;
      continue;
    }
    applicable++;
    const expected = ROLE_TYPES[role];
    if (hasType(extractSchema(raw.body).nodes, expected)) {
      covered++;
    } else {
      const rendered = ctx.render.pages[url];
      if (rendered && hasType(extractSchema(rendered.html).nodes, expected)) jsOnly++;
    }
  }
  if (applicable === 0) {
    return diagnostic(
      "E1.11",
      "N/A",
      { evidence_tier: "A-deterministic", applicable_pages: 0 },
      "No inventory page has an applicable role for schema coverage.",
      "No action required unless product, article or organisation pages exist."
    );
  }
  const coverage = round1((covered / applicable) * 100);
  return diagnostic(
    "E1.11",
    "DIAGNOSTIC",
    {
      applicable_pages: applicable,
      pages_with_expected_type_in_raw_html: covered,
      coverage_pct: coverage,
      js_only_injections: ctx.render.available ? jsOnly : "not measured (no browser)",
      pages_unassessed: unassessed,
      evidence_tier: "A-deterministic",
    },
    `${covered} of ${applicable} applicable pages contain the expected schema type in raw HTML. Coverage is not validity and does not guarantee inclusion. Merged into E1.12 scope; no independent weight.`,
    coverage >= 100 ? "Expected schema is present in raw HTML." : "Add the expected schema type to server-delivered HTML on applicable pages."
  );
}

// ---------------------------------------------------------------------------
// E1.12 - Structured Data Quality (scored 6%)
// Page score = 100 x P x (0.50 x V + 0.50 x A).
// P = 1 when the expected type is present in raw HTML (any source), else 0 (verified missing type on an applicable page).
// V = required-property validity, from JSON-LD objects only. A = visible-text alignment of name, headline and price.
// Rendered-only schema is reported and flags the signal PARTIAL; it does not raise the raw-HTML score.
// ---------------------------------------------------------------------------
export function evaluateE112(ctx: Ctx): Signal {
  const rows: { url: string; score: number; weight: number; P: number; V: number; A: number }[] = [];
  let unassessed = 0;
  let withType = 0;
  let renderedOnlyPages = 0;
  let jsonldErrors = 0;
  let sumV = 0;
  let sumA = 0;

  for (const url of ctx.urls) {
    const role = pageRole(url);
    if (role === "other") continue;
    const raw = ctx.pages[url];
    if (!isOk(raw)) {
      unassessed++;
      continue;
    }
    const schema = extractSchema(raw.body);
    jsonldErrors += schema.jsonldErrors;
    const expected = ROLE_TYPES[role];
    const required = ROLE_REQUIRED[role];
    const P = hasType(schema.nodes, expected) ? 1 : 0;
    if (P) withType++;
    const rendered = ctx.render.pages[url];
    if (!P && rendered && rendered.html && hasType(extractSchema(rendered.html).nodes, expected)) renderedOnlyPages++;

    const match = schema.nodes.find((n) => n.source === "jsonld" && expected.indexOf(n.type) >= 0);
    const obj = match ? match.obj : null;

    const V = obj ? required.filter((p) => propOk(obj, p)).length / required.length : 0;

    const visible = normalizeText(visibleText(raw.body));
    const values: string[] = [];
    if (obj) {
      if (typeof obj.name === "string") values.push(obj.name);
      if (typeof obj.headline === "string") values.push(obj.headline);
      const offers = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
      if (offers && offers.price !== undefined) values.push(String(offers.price));
    }
    const matched = values.filter((v) => v.trim() && visible.indexOf(normalizeText(v)) >= 0).length;
    const A = values.length ? matched / values.length : 0;

    sumV += V;
    sumA += A;
    rows.push({ url, score: 100 * P * (0.5 * V + 0.5 * A), weight: url === ctx.home ? 2 : 1, P, V, A });
  }

  if (rows.length === 0) {
    return scored(
      "E1.12",
      null,
      "N/A",
      "high",
      { evidence_tier: "A-deterministic", applicable_pages: 0 },
      "No inventory page has an applicable role for schema quality.",
      "No action required unless product, article or organisation pages exist."
    );
  }

  const wsum = rows.reduce((t, r) => t + r.weight, 0);
  const score = round1(rows.reduce((t, r) => t + r.score * r.weight, 0) / wsum);
  const meanV = round1((sumV / rows.length) * 100) / 100;
  const meanA = round1((sumA / rows.length) * 100) / 100;
  const coverageP = round1((withType / rows.length) * 100) / 100;
  const assessment = unassessed > 0 || renderedOnlyPages > 0 ? "PARTIAL" : "ASSESSED";
  const zeroReason =
    withType === 0
      ? `The expected schema type is absent from raw HTML on all ${rows.length} applicable page(s), so coverage P = 0 and the score is 0. Validity V (mean ${meanV}) and alignment A (mean ${meanA}) are not counted when P = 0.`
      : `Score reflects coverage P on ${withType} of ${rows.length} applicable page(s).`;

  return scored(
    "E1.12",
    score,
    assessment,
    "high",
    {
      applicable_pages: rows.length,
      coverage_P_mean: coverageP,
      validity_V_mean: meanV,
      validity_V_source: "JSON-LD objects only",
      alignment_A_mean: meanA,
      json_ld_syntax_errors: jsonldErrors,
      rendered_only_schema_pages: renderedOnlyPages,
      pages_unassessed: unassessed,
      composite_formula: "100 x P x (0.5 V + 0.5 A) per page; site = importance-weighted mean",
      evidence_tier: "A-deterministic",
    },
    `Quality score ${score} over ${rows.length} applicable page(s). ${zeroReason}${
      renderedOnlyPages > 0 ? ` ${renderedOnlyPages} page(s) have schema only after JavaScript; this is reported, not counted in the raw-HTML score.` : ""
    }`,
    score >= 90
      ? "Structured data is present, valid and aligned with visible content."
      : "Server-render the expected schema, fix required properties, and align values with visible text."
  );
}
