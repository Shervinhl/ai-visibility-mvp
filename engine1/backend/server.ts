import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  HANDBOOK_VERSION,
  FRAMEWORK_VERSION,
  EVALUATOR_VERSION,
  NEUTRAL_UA,
  BROWSER_TIMEOUT_MS,
  CONCURRENCY,
  MIN_COVERAGE,
  KNOWN_DISCREPANCIES,
  DEFERRED_DECISIONS,
  ROUNDS,
  ROUND_SPACING_MS,
  SCORE_BANDS,
  SIGNAL_IDS,
  Ctx,
  Signal,
  Fetched,
  Rendered,
  RenderResult,
  assertRegistry,
  normalizeDomain,
  mapLimit,
  fetchPage,
  loadRobots,
  discoverSitemaps,
  buildInventory,
  crawlSite,
  hashText,
  visibleText,
  getStatusBand,
  round1,
} from "./engine/core";
import {
  evaluateE101,
  evaluateE102,
  evaluateE103,
  evaluateE104,
  evaluateE105,
  evaluateE106,
  evaluateE107,
} from "./engine/signals-a";
import {
  ContentUnitRef,
  evaluateE108,
  evaluateE109,
  evaluateE110,
  evaluateE111,
  evaluateE112,
} from "./engine/signals-b";
import { evaluateE113, evaluateE114, evaluateE115, evaluateE116, Snapshot } from "./engine/signals-c";

// ---------------------------------------------------------------------------
// Optional headless render (E1.08 and E1.09 diagnostic). Requires:
//   npm install playwright && npx playwright install chromium
// A smoke test runs before any page is rendered.
// ---------------------------------------------------------------------------
async function renderPages(urls: string[]): Promise<RenderResult> {
  let pw: any;
  try {
    pw = require("playwright");
  } catch {
    return { available: false, reason: "Playwright not installed (npm install playwright)", version: "", pages: {} };
  }

  let browser: any;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch {
    return {
      available: false,
      reason: "Chromium not installed (npx playwright install chromium)",
      version: "",
      pages: {},
    };
  }

  const version: string = String(browser.version ? browser.version() : "unknown");
  try {
    const probe = await browser.newPage();
    await probe.setContent("<p>smoke test</p>");
    const text: string = await probe.evaluate("document.body.innerText");
    await probe.close();
    if (!text || text.indexOf("smoke test") < 0) {
      await browser.close();
      return { available: false, reason: "browser smoke test failed", version, pages: {} };
    }
  } catch {
    await browser.close().catch(() => undefined);
    return { available: false, reason: "browser smoke test failed", version, pages: {} };
  }

  const pages: Record<string, Rendered> = {};
  try {
    for (const url of urls) {
      const context = await browser.newContext({ userAgent: NEUTRAL_UA });
      const page = await context.newPage();
      let consoleErrors = 0;
      let failedRequests = 0;
      let timedOut = false;
      page.on("console", (m: any) => {
        if (m.type() === "error") consoleErrors++;
      });
      page.on("requestfailed", () => {
        failedRequests++;
      });
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: BROWSER_TIMEOUT_MS });
      } catch {
        timedOut = true;
      }
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)").catch(() => undefined);
      const html: string = await page.content().catch(() => "");
      pages[url] = { url, html, consoleErrors, failedRequests, timedOut };
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { available: true, reason: "Rendered with headless Chromium", version, pages };
}

// ---------------------------------------------------------------------------
// Audit history (E1.15 accuracy component). Only the latest audit per domain is kept.
// Stored in backend/data/audit-history.json.
// ---------------------------------------------------------------------------
const HISTORY_FILE = path.join(process.cwd(), "data", "audit-history.json");

function loadHistory(): Record<string, Snapshot> {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")) as Record<string, Snapshot>;
  } catch {
    return {};
  }
}

function saveSnapshot(domain: string, snapshot: Snapshot): void {
  try {
    const all = loadHistory();
    all[domain] = snapshot;
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(all, null, 2));
  } catch {
    // History is best-effort; the audit result does not depend on it.
  }
}

function buildSnapshot(ctx: Ctx): Snapshot {
  const snap: Snapshot = {};
  for (const u of ctx.urls) {
    const p = ctx.pages[u];
    if (!p || p.transport || p.status < 200 || p.status >= 300) continue;
    snap[u] = { hash: hashText(visibleText(p.body)), lastmod: ctx.sitemaps.lastmod[u] || "" };
  }
  return snap;
}

// ---------------------------------------------------------------------------
// Aggregation (handbook section 4). E1 = sum(score x weight) / sum(weights of applicable, assessed, scored signals).
// Diagnostics and N/A signals are excluded. UNASSESSED is never converted to 0.
// The score is published only when assessed weight / applicable weight meets MIN_COVERAGE (provisional placeholder).
// ---------------------------------------------------------------------------
function aggregate(signals: Signal[]) {
  const applicable = signals.filter((x) => !x.is_diagnostic && x.weight > 0 && x.assessment !== "N/A");
  const numeric = applicable.filter((x) => x.score !== null);
  const wNum = numeric.reduce((t, x) => t + x.weight, 0);
  const wApp = applicable.reduce((t, x) => t + x.weight, 0);
  const provisional = wNum > 0 ? round1(numeric.reduce((t, x) => t + (x.score as number) * x.weight, 0) / wNum) : null;
  const coverageRatio = wApp > 0 ? wNum / wApp : 0;
  const publishable = provisional !== null && coverageRatio >= MIN_COVERAGE;

  let engineStatus = "UNASSESSED";
  if (numeric.length > 0) {
    engineStatus = applicable.every((x) => x.assessment === "ASSESSED") ? "ASSESSED" : "PARTIAL";
  }

  const terms = numeric.slice(0, 3).map((x) => `${x.score} x ${x.weight}`);
  const example =
    provisional === null
      ? "No numeric signal scores, so no engine score is produced."
      : `(${terms.join(" + ")}${numeric.length > 3 ? " + ..." : ""}) / ${wNum} = ${provisional}${
          publishable ? "" : " (not published: assessed weight is below the coverage threshold)"
        }`;

  return {
    score: publishable ? provisional : null,
    provisionalScore: provisional,
    publishable,
    band: publishable && provisional !== null ? getStatusBand(provisional) : null,
    status: engineStatus,
    coverage: {
      weight_assessed: wNum,
      weight_total: wApp,
      weight_ratio: round1(coverageRatio * 100) + "%",
      min_coverage_required: round1(MIN_COVERAGE * 100) + "% (provisional placeholder, not a validated threshold)",
      signals_implemented: numeric.length,
      signals_scored_total: applicable.length,
    },
    calculation: {
      formula: "E1 = sum(score x weight) / sum(weights of applicable, assessed, scored signals)",
      scored_signals: numeric.map((x) => `${x.signal_id} ${x.signal_name} (weight ${x.weight}): ${x.score}`).join("; ") || "none",
      weight_assessed: wNum,
      weight_total: wApp,
      example,
    },
  };
}

// ---------------------------------------------------------------------------
// Audit run
// ---------------------------------------------------------------------------
async function runAudit(domain: string, customerUrls: string[], contentUnits: ContentUnitRef[]) {
  const registryErrors = assertRegistry();
  if (registryErrors.length > 0) {
    throw new Error("FAILED_VALIDATION: " + registryErrors.join("; "));
  }

  const previous = loadHistory()[domain];
  const home = `https://${domain}/`;

  const robots = await loadRobots(domain);
  const sitemaps = await discoverSitemaps(domain, robots.body);
  const inv = buildInventory(domain, sitemaps, customerUrls);
  const urls = inv.urls;

  const crawl = await crawlSite(domain, home);
  const fetched = await mapLimit(urls, CONCURRENCY, async (u) => ({ u, f: await fetchPage(u, NEUTRAL_UA) }));
  const pages: Record<string, Fetched> = {};
  for (const item of fetched) pages[item.u] = item.f;

  const render = await renderPages(urls);
  const ctx: Ctx = {
    domain,
    home,
    urls,
    inventoryNote: inv.note,
    customerUrlCount: customerUrls.length,
    robots,
    sitemaps,
    pages,
    crawl,
    render,
  };

  const s: Record<string, Signal> = {};
  s["E1.01"] = await evaluateE101(urls, robots);
  s["E1.02"] = evaluateE102(ctx);
  s["E1.03"] = await evaluateE103(urls);
  s["E1.04"] = evaluateE104(ctx);
  s["E1.05"] = evaluateE105(ctx, hashText);
  s["E1.06"] = await evaluateE106(ctx);
  s["E1.07"] = evaluateE107(ctx);
  const e109 = evaluateE109(ctx, contentUnits);
  s["E1.08"] = evaluateE108(ctx, e109.renderedOnly);
  s["E1.09"] = e109.signal;
  s["E1.10"] = evaluateE110(ctx);
  s["E1.11"] = evaluateE111(ctx);
  s["E1.12"] = evaluateE112(ctx);
  s["E1.13"] = await evaluateE113(ctx);
  s["E1.14"] = await evaluateE114(ctx);
  s["E1.15"] = await evaluateE115(ctx, previous);
  s["E1.16"] = evaluateE116();

  saveSnapshot(domain, buildSnapshot(ctx));

  const signals = SIGNAL_IDS.map((id) => s[id]);
  const engine = aggregate(signals);

  return {
    domain,
    audit_id: randomUUID(),
    handbook_version: HANDBOOK_VERSION,
    framework_version: FRAMEWORK_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    registry_check: "passed",
    timestamp: new Date().toISOString(),
    bands: SCORE_BANDS,
    frozen_inputs: {
      inventory_hash: hashText(urls.join("\n")),
      important_urls: urls.length,
      customer_urls: customerUrls.length,
      reference_content_units: contentUnits.length,
      previous_audit_available: previous ? "yes" : "no",
      robots_mode: robots.mode,
      sitemaps_found: sitemaps.files.length,
      browser_version: render.version || "not available",
      round_spacing_minutes: Math.round(ROUND_SPACING_MS / 60000),
    },
    inventory_note: inv.note,
    render: { available: render.available, reason: render.reason },
    engines: {
      engine1: {
        score: engine.score,
        provisional_score: engine.provisionalScore,
        publishable: engine.publishable,
        band: engine.band,
        status: engine.status,
        signals,
        calculation: engine.calculation,
      },
    },
    overallScore: null,
    coverage: engine.coverage,
    known_discrepancies: KNOWN_DISCREPANCIES,
    deferred_decisions: DEFERRED_DECISIONS,
  };
}

// ---------------------------------------------------------------------------
// Background jobs. An audit takes about two hours (one-hour round spacing for E1.03),
// so POST starts the job and returns an ID; GET polls for the result.
// ---------------------------------------------------------------------------
interface Job {
  id: string;
  domain: string;
  status: "running" | "done" | "failed";
  created: string;
  finished?: string;
  data?: unknown;
  error?: string;
}
const jobs: Record<string, Job> = {};

// ---------------------------------------------------------------------------
// HTTP
// POST /api/audit  body: { domain, urls?: string[], contentUnits?: { url, text, weight? }[] }  -> 202 { job_id }
// GET  /api/audit/:id                                                                          -> running | done | failed
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, handbook: HANDBOOK_VERSION, evaluator: EVALUATOR_VERSION, signals: SIGNAL_IDS.length });
});

app.post("/api/audit", (req, res) => {
  const domain = normalizeDomain(String(req.body?.domain ?? ""));
  if (!domain) {
    res.status(400).json({ success: false, error: "Enter a valid domain, for example example.com" });
    return;
  }
  const customerUrls: string[] = Array.isArray(req.body?.urls)
    ? req.body.urls.filter((u: unknown) => typeof u === "string").slice(0, 200)
    : [];
  const contentUnits: ContentUnitRef[] = Array.isArray(req.body?.contentUnits)
    ? req.body.contentUnits
        .filter((u: any) => u && typeof u.url === "string" && typeof u.text === "string" && u.text.trim().length > 0)
        .map((u: any) => ({ url: u.url, text: u.text, weight: typeof u.weight === "number" ? u.weight : 1 }))
        .slice(0, 2000)
    : [];

  const id = randomUUID();
  const job: Job = { id, domain, status: "running", created: new Date().toISOString() };
  jobs[id] = job;

  runAudit(domain, customerUrls, contentUnits)
    .then((data) => {
      job.status = "done";
      job.finished = new Date().toISOString();
      job.data = data;
    })
    .catch((err: any) => {
      job.status = "failed";
      job.finished = new Date().toISOString();
      job.error = err?.message || "Audit failed";
    });

  res.status(202).json({
    success: true,
    job_id: id,
    status: "running",
    domain,
    estimated_minutes: Math.round(((ROUNDS - 1) * ROUND_SPACING_MS) / 60000),
  });
});

app.get("/api/audit/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) {
    res.status(404).json({ success: false, error: "Unknown job" });
    return;
  }
  if (job.status === "running") {
    res.json({ success: true, status: "running", domain: job.domain, created: job.created });
    return;
  }
  if (job.status === "failed") {
    res.json({ success: false, status: "failed", error: job.error });
    return;
  }
  res.json({ success: true, status: "done", data: job.data });
});

app.listen(3000, () => {
  console.log("Besignitics Engine 1 backend running on http://localhost:3000 (16 signals, evaluator " + EVALUATOR_VERSION + ")");
});
