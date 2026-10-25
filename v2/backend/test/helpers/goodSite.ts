import { loadCheckConfig, CheckConfig } from "../../src/config";
import { runChecks, CheckRunOutput } from "../../src/checks/runner";
import { CheckOutcome, CheckId } from "../../src/checks/types";
import { FactList, normalizeFactList } from "../../src/facts/types";
import { FakeRenderer, FakeRoute, FakeTransport, fakeDeps, html } from "./fakeTransport";

export const G = "https://good.example";
export const g = (p: string) => `${G}${p}`;

const DESC = "GoodCo makes simple scheduling software for small clinics in Toronto and beyond.";
const ORG = JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "GoodCo" });

export function goodPages(): Record<string, string> {
  return {
    "/": html({
      title: "GoodCo - scheduling for small clinics",
      h1: "Scheduling software for small clinics",
      description: DESC,
      canonical: g("/"),
      jsonLd: [ORG],
      body: `<p>GoodCo helps you book patients online. Simple scheduling for small clinics. Based in Toronto, Ontario.</p><a href="/pricing">Pricing</a> <a href="/contact">Contact us</a>`,
    }),
    "/pricing": html({
      title: "Pricing | GoodCo",
      h1: "Pricing",
      description: "GoodCo pricing: one simple plan for small clinics, billed monthly, cancel any time you like.",
      canonical: g("/pricing"),
      jsonLd: [JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "GoodCo Pro" })],
      body: `<p>Pro plan: $29 per month.</p><a href="/">Home</a>`,
    }),
    "/contact": html({
      title: "Contact | GoodCo",
      h1: "Contact",
      description: "Contact GoodCo by email for sales, support and billing questions. We reply within one business day.",
      canonical: g("/contact"),
      body: `<p>Email <a href="mailto:hello@good.example">hello@good.example</a></p>`,
    }),
  };
}

export const ROBOTS_OK = `User-agent: *\nAllow: /\n\nSitemap: ${G}/sitemap.xml\n`;
export const SITEMAP_OK = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${G}/</loc></url><url><loc>${G}/pricing</loc></url><url><loc>${G}/contact</loc></url></urlset>`;

export function goodRoutes(overrides: Record<string, FakeRoute | undefined> = {}, pages = goodPages()): Record<string, FakeRoute> {
  const routes: Record<string, FakeRoute> = {
    [g("/robots.txt")]: { status: 200, headers: { "content-type": "text/plain" }, body: ROBOTS_OK },
    [g("/sitemap.xml")]: { status: 200, headers: { "content-type": "application/xml" }, body: SITEMAP_OK },
  };
  for (const [p, body] of Object.entries(pages)) routes[g(p)] = { status: 200, body };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete routes[k];
    else routes[k] = v;
  }
  return routes;
}

export function goodFacts(over: Partial<FactList> = {}): FactList {
  return normalizeFactList({
    businessName: "GoodCo",
    aliases: [],
    website: g("/"),
    whatItDoes: "GoodCo makes online scheduling software for small clinics.",
    whatItDoesPhrase: "simple scheduling for small clinics",
    productCategory: "clinic scheduling software",
    products: [{ name: "GoodCo Pro", description: "Online booking" }],
    buyers: ["clinic owners"],
    locations: ["Toronto, ON, Canada"],
    prices: [{ plan: "Pro", amount: 29, currency: "USD", period: "month", pageUrl: g("/pricing") }],
    contact: { url: g("/contact"), email: "hello@good.example" },
    competitors: [],
    keyPages: [g("/pricing"), g("/contact")],
    usesStructuredData: true,
    ...over,
  });
}

export interface RunOpts {
  routes?: Record<string, FakeRoute>;
  facts?: FactList | null;
  renderer?: FakeRenderer;
  cfg?: Partial<CheckConfig>;
}

/** Renders every page with its own raw HTML unless told otherwise. */
export function sameRenderer(routes: Record<string, FakeRoute>): FakeRenderer {
  const pages: Record<string, string> = {};
  for (const [u, r] of Object.entries(routes)) {
    if (!Array.isArray(r) && typeof r === "object" && typeof r.body === "string") pages[u] = r.body;
  }
  return new FakeRenderer(pages);
}

export async function run(opts: RunOpts = {}): Promise<{ out: CheckRunOutput; transport: FakeTransport; get: (id: CheckId) => CheckOutcome }> {
  const routes = opts.routes ?? goodRoutes();
  const facts = opts.facts === undefined ? goodFacts() : opts.facts;
  const cfg = loadCheckConfig({ requestDelayMs: 0, ...(opts.cfg ?? {}) });
  const transport = new FakeTransport(routes);
  const out = await runChecks({ homepage: g("/"), keyPages: facts?.keyPages ?? [g("/pricing"), g("/contact")], facts }, cfg, fakeDeps(transport), opts.renderer ?? sameRenderer(routes));
  const get = (id: CheckId) => out.outcomes.find((o) => o.checkId === id)!;
  return { out, transport, get };
}
