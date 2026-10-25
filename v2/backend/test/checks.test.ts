import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { run, goodRoutes, goodPages, goodFacts, g, G, ROBOTS_OK, SITEMAP_OK, sameRenderer } from "./helpers/goodSite";
import { FakeRenderer, html } from "./helpers/fakeTransport";
import { CHECK_IDS } from "../src/checks/types";
import { isAllowed, parseRobots } from "../src/checks/robots";
import { normalizeUrl } from "../src/checks/url";
import { priceRegex } from "../src/checks/checks";

const PDF = { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF-1.4 fake" };
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("baseline site", () => {
  test("all 12 checks PASS on the good fixture, every result has evidence and the check version", async () => {
    const { out } = await run();
    assert.equal(out.outcomes.length, 12);
    for (const o of out.outcomes) {
      assert.equal(o.status, "PASS", `${o.checkId}: ${o.reason}`);
      assert.equal(o.evidence.checkVersion, out.checkVersion);
      assert.ok(o.evidence.observedAt);
      for (const p of o.pages) assert.equal(p.evidence.checkVersion, out.checkVersion);
    }
    assert.deepEqual(out.outcomes.map((o) => o.checkId), [...CHECK_IDS]);
  });

  test("NOT_ASSESSED and NOT_APPLICABLE always carry a reason and a next step", async () => {
    const { out } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 503 } }), renderer: new FakeRenderer("not-installed") });
    for (const o of out.outcomes) {
      for (const r of [o, ...o.pages]) {
        if (r.status === "NOT_ASSESSED" || r.status === "NOT_APPLICABLE") {
          assert.ok(r.reason.length > 0, `${o.checkId} reason`);
          assert.ok(r.nextStep && r.nextStep.length > 0, `${o.checkId} next step`);
        }
      }
    }
  });
});

describe("A1 AI crawlers are allowed", () => {
  test("FAIL when GPTBot is disallowed for a key page, listing the crawler and rule", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 200, body: `User-agent: GPTBot\nDisallow: /pricing\n\nUser-agent: *\nAllow: /\nSitemap: ${G}/sitemap.xml` } }) });
    const a1 = get("A1");
    assert.equal(a1.status, "FAIL");
    const page = a1.pages.find((p) => p.pageUrl === g("/pricing"))!;
    assert.equal(page.status, "FAIL");
    assert.match(page.reason, /GPTBot/);
    assert.match(page.reason, /Disallow: \/pricing/);
  });
  test("PASS with 'no rules' reason when robots.txt is 404", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 404 } }) });
    assert.equal(get("A1").status, "PASS");
    assert.match(get("A1").pages[0].reason, /no rules/);
  });
  test("NOT_ASSESSED when robots.txt returns 5xx, and no page is fetched (RFC 9309 disallow-all)", async () => {
    const { get, transport } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 503 } }) });
    assert.equal(get("A1").status, "NOT_ASSESSED");
    assert.ok(!transport.calls.includes(g("/")), "homepage must not be fetched when robots.txt is unavailable");
  });
  test("NOT_ASSESSED when robots.txt times out on every retry", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/robots.txt")]: "timeout" }) });
    assert.equal(get("A1").status, "NOT_ASSESSED");
  });
});

describe("A2 Key pages load normally", () => {
  test("FAIL on HTTP 500", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: { status: 500 } }) });
    assert.equal(get("A2").status, "FAIL");
    assert.match(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.reason, /HTTP 500/);
  });
  test("FAIL on a redirect loop", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: { status: 301, headers: { location: "/pricing-2" } }, [g("/pricing-2")]: { status: 302, headers: { location: "/pricing" } } }) });
    assert.match(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.reason, /redirect loop/);
  });
  test("PASS when a page redirects once and ends on 200", async () => {
    const pages = goodPages();
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: { status: 301, headers: { location: "/pricing/" } }, [g("/pricing/")]: { status: 200, body: pages["/pricing"] } }) });
    assert.equal(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.status, "PASS");
  });
  test("NOT_ASSESSED when every attempt times out", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: "timeout" }) });
    assert.equal(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.status, "NOT_ASSESSED");
  });
  test("NOT_ASSESSED when every attempt gets 429 (Retry-After respected)", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: { status: 429, headers: { "retry-after": "1" } } }) });
    assert.equal(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.status, "NOT_ASSESSED");
  });
  test("retries a 429 and passes when the retry succeeds", async () => {
    const pages = goodPages();
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: [{ status: 429 }, { status: 200, body: pages["/pricing"] }] }) });
    assert.equal(get("A2").pages.find((p) => p.pageUrl === g("/pricing"))!.status, "PASS");
  });
});

describe("A3 Main text in raw HTML", () => {
  test("FAIL when rendered text is 200+ words and raw has under 50%", async () => {
    const shell = html({ title: "App", h1: "App", description: "x".repeat(60), canonical: g("/pricing"), body: `<div id="root"></div>` });
    const routes = goodRoutes({ [g("/pricing")]: { status: 200, body: shell } });
    const renderer = sameRenderer(routes);
    (renderer as unknown as { pages: Record<string, string> }).pages[g("/pricing")] = html({ title: "App", h1: "App", body: `<article><p>${words(400)}</p></article>` });
    const { get } = await run({ routes, renderer });
    const p = get("A3").pages.find((x) => x.pageUrl === g("/pricing"))!;
    assert.equal(p.status, "FAIL");
  });
  test("PASS when the rendered page has under 200 words", async () => {
    const { get } = await run();
    assert.equal(get("A3").status, "PASS");
  });
  test("NOT_ASSESSED with the install command when the browser is not installed", async () => {
    const { get } = await run({ renderer: new FakeRenderer("not-installed") });
    assert.equal(get("A3").status, "NOT_ASSESSED");
    assert.match(get("A3").nextStep ?? "", /playwright install chromium/);
  });
  test("NOT_ASSESSED when rendering times out", async () => {
    const routes = goodRoutes();
    const r = sameRenderer(routes);
    (r as unknown as { pages: Record<string, string> }).pages[g("/pricing")] = "timeout";
    const { get } = await run({ routes, renderer: r });
    assert.equal(get("A3").pages.find((x) => x.pageUrl === g("/pricing"))!.status, "NOT_ASSESSED");
  });
  test("NOT_APPLICABLE for a PDF key page", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: PDF }) });
    assert.equal(get("A3").pages.find((x) => x.pageUrl === g("/pricing"))!.status, "NOT_APPLICABLE");
  });
});

describe("A4 Title and main heading", () => {
  test("FAIL with two h1 elements", async () => {
    const pages = goodPages();
    pages["/pricing"] = pages["/pricing"].replace("<h1>Pricing</h1>", "<h1>Pricing</h1><h1>Plans</h1>");
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A4").pages.find((x) => x.pageUrl === g("/pricing"))!.reason, /2 <h1>/);
  });
  test("FAIL when a title is shared by two pages", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace("<title>Contact | GoodCo</title>", "<title>Pricing | GoodCo</title>");
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A4").status, "FAIL");
    assert.match(get("A4").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /also used by/);
  });
  test("FAIL with an empty title", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace("<title>Contact | GoodCo</title>", "<title> </title>");
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A4").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /missing or empty/);
  });
  test("NOT_APPLICABLE for a file download, naming the type", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: PDF }) });
    const p = get("A4").pages.find((x) => x.pageUrl === g("/pricing"))!;
    assert.equal(p.status, "NOT_APPLICABLE");
    assert.match(p.reason, /application\/pdf/);
  });
  test("NOT_ASSESSED when the page returns 404", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: { status: 404 } }) });
    assert.equal(get("A4").pages.find((x) => x.pageUrl === g("/pricing"))!.status, "NOT_ASSESSED");
  });
});

describe("A5 Meta description", () => {
  test("FAIL when missing", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace(/<meta name="description"[^>]*>/, "");
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A5").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /no meta description/);
  });
  test("FAIL when shorter than 50 characters", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace(/<meta name="description"[^>]*>/, '<meta name="description" content="Too short">');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A5").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /9 characters/);
  });
  test("NOT_APPLICABLE for a PDF", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: PDF }) });
    assert.equal(get("A5").pages.find((x) => x.pageUrl === g("/pricing"))!.status, "NOT_APPLICABLE");
  });
  test("NOT_ASSESSED when the page times out", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: "timeout" }) });
    assert.equal(get("A5").status, "NOT_ASSESSED");
  });
});

describe("A6 Business basics are text", () => {
  test("FAIL when the name only appears in an image alt text", async () => {
    const pages = goodPages();
    for (const k of Object.keys(pages)) pages[k] = pages[k].replace(/GoodCo/g, "Our company");
    pages["/"] = pages["/"].replace("<body>", '<body><img src="logo.png" alt="GoodCo">');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A6").status, "FAIL");
    assert.match(get("A6").reason, /only in image alt text/);
  });
  test("NOT_ASSESSED when there is no fact list", async () => {
    const { get } = await run({ facts: null });
    assert.equal(get("A6").status, "NOT_ASSESSED");
    assert.match(get("A6").nextStep ?? "", /fact list/);
  });
  test("NOT_ASSESSED naming the missing input when location is not supplied", async () => {
    const { get } = await run({ facts: goodFacts({ locations: [] }) });
    assert.equal(get("A6").status, "NOT_ASSESSED");
    assert.match(get("A6").nextStep ?? "", /location/);
  });
});

describe("A7 Prices are text", () => {
  test("FAIL when the price is not in the raw HTML", async () => {
    const pages = goodPages();
    pages["/pricing"] = pages["/pricing"].replace("$29 per month", '<span id="price"></span>');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A7").status, "FAIL");
  });
  test("NOT_APPLICABLE when no prices are listed", async () => {
    const { get } = await run({ facts: goodFacts({ prices: [] }) });
    assert.equal(get("A7").status, "NOT_APPLICABLE");
  });
  test("NOT_ASSESSED when a price has no page URL", async () => {
    const { get } = await run({ facts: goodFacts({ prices: [{ plan: "Pro", amount: 29, currency: "USD", period: "month" }] }) });
    assert.equal(get("A7").status, "NOT_ASSESSED");
    assert.match(get("A7").nextStep ?? "", /pageUrl/);
  });
  test("price matching respects number boundaries", () => {
    assert.ok(priceRegex(29).test("Pro: $29/mo"));
    assert.ok(priceRegex(29).test("29.00 USD"));
    assert.ok(!priceRegex(29).test("$290 per year"));
    assert.ok(!priceRegex(29).test("$129"));
    assert.ok(priceRegex(1200).test("$1,200"));
    assert.ok(priceRegex(19.99).test("19,99 €"));
    assert.ok(priceRegex(0).test("Start free"));
  });
});

describe("A8 Canonical tag", () => {
  test("FAIL when it points to another page", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace(`href="${g("/contact")}"`, `href="${g("/")}"`);
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A8").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /not to this page/);
  });
  test("FAIL with two canonical tags", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace("</head>", `<link rel="canonical" href="${g("/contact")}"></head>`);
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A8").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /2 canonical tags/);
  });
  test("PASS after normalization (tracking parameters, trailing slash, host case)", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace(`href="${g("/contact")}"`, `href="https://GOOD.example/contact/?utm_source=x"`);
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A8").pages.find((x) => x.pageUrl === g("/contact"))!.status, "PASS");
  });
  test("NOT_ASSESSED when a key page could not be fetched", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: "timeout" }) });
    assert.equal(get("A8").status, "NOT_ASSESSED");
  });
  test("NOT_APPLICABLE for a PDF", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/pricing")]: PDF }) });
    assert.equal(get("A8").pages.find((x) => x.pageUrl === g("/pricing"))!.status, "NOT_APPLICABLE");
  });
});

describe("A9 No blocking tags", () => {
  test("FAIL on meta robots noindex", async () => {
    const pages = goodPages();
    pages["/contact"] = pages["/contact"].replace("</head>", '<meta name="robots" content="noindex, follow"></head>');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A9").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /noindex/);
  });
  test("FAIL on X-Robots-Tag: none header", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: { status: 200, headers: { "x-robots-tag": "none" }, body: goodPages()["/contact"] } }) });
    assert.match(get("A9").pages.find((x) => x.pageUrl === g("/contact"))!.reason, /X-Robots-Tag/);
  });
  test("does not confuse 'noindex' substrings in other words", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: { status: 200, headers: { "x-robots-tag": "max-snippet:-1" }, body: goodPages()["/contact"] } }) });
    assert.equal(get("A9").status, "PASS");
  });
  test("NOT_ASSESSED when a page could not be fetched", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: "timeout" }) });
    assert.equal(get("A9").status, "NOT_ASSESSED");
  });
});

describe("A10 Sitemap", () => {
  test("FAIL when a key page is missing from the sitemap", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/sitemap.xml")]: { status: 200, body: SITEMAP_OK.replace(`<url><loc>${G}/contact</loc></url>`, "") } }) });
    assert.equal(get("A10").status, "FAIL");
    assert.match(get("A10").reason, /contact/);
  });
  test("FAIL when robots.txt has no Sitemap: line", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 200, body: "User-agent: *\nAllow: /\n" } }) });
    assert.match(get("A10").reason, /no Sitemap: line/);
  });
  test("FAIL when the XML does not parse", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/sitemap.xml")]: { status: 200, body: "<urlset><url><loc>broken" } }) });
    assert.match(get("A10").reason, /does not parse/);
  });
  test("FAIL when the sitemap is missing (404)", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/sitemap.xml")]: { status: 404 } }) });
    assert.match(get("A10").reason, /no sitemap was found/);
  });
  test("NOT_ASSESSED when the sitemap returns 503", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/sitemap.xml")]: { status: 503 } }) });
    assert.equal(get("A10").status, "NOT_ASSESSED");
  });
  test("follows a sitemap index", async () => {
    const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${G}/sitemap-pages.xml</loc></sitemap></sitemapindex>`;
    const { get } = await run({ routes: goodRoutes({ [g("/sitemap.xml")]: { status: 200, body: index }, [g("/sitemap-pages.xml")]: { status: 200, body: SITEMAP_OK } }) });
    assert.equal(get("A10").status, "PASS");
  });
});

describe("A11 Key pages linked from the homepage", () => {
  test("FAIL when the only link is nofollow and the crawl was complete", async () => {
    const pages = goodPages();
    pages["/"] = pages["/"].replace('<a href="/contact">', '<a rel="nofollow" href="/contact">');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A11").pages.find((x) => x.pageUrl === g("/contact"))!.status, "FAIL");
  });
  test("PASS when a page is 2 steps deep, with the linking page in the evidence", async () => {
    const pages = goodPages();
    pages["/"] = pages["/"].replace('<a href="/contact">Contact us</a>', '<a href="/about">About</a>');
    pages["/about"] = html({ title: "About", h1: "About", body: '<a href="/contact">Contact</a>' });
    const { get } = await run({ routes: goodRoutes({}, pages) });
    const p = get("A11").pages.find((x) => x.pageUrl === g("/contact"))!;
    assert.equal(p.status, "PASS");
    assert.equal((p.evidence.data as { depth: number }).depth, 2);
  });
  test("FAIL when a page is 5 steps deep", async () => {
    const pages = goodPages();
    pages["/"] = pages["/"].replace('<a href="/contact">Contact us</a>', '<a href="/l1">x</a>');
    for (let i = 1; i <= 4; i++) pages[`/l${i}`] = html({ title: `L${i}`, h1: "x", body: `<a href="${i < 4 ? `/l${i + 1}` : "/contact"}">next</a>` });
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A11").pages.find((x) => x.pageUrl === g("/contact"))!.status, "FAIL");
  });
  test("NOT_ASSESSED when the homepage cannot be fetched", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/")]: { status: 500 } }) });
    assert.equal(get("A11").status, "NOT_ASSESSED");
  });
});

describe("A12 Structured data", () => {
  test("FAIL when a JSON-LD block does not parse", async () => {
    const pages = goodPages();
    pages["/pricing"] = pages["/pricing"].replace('"GoodCo Pro"}', '"GoodCo Pro",}');
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.equal(get("A12").status, "FAIL");
    assert.match(get("A12").reason, /pricing/);
  });
  test("FAIL when no page has JSON-LD", async () => {
    const pages = goodPages();
    for (const k of Object.keys(pages)) pages[k] = pages[k].replace(/<script type="application\/ld\+json">.*?<\/script>/g, "");
    const { get } = await run({ routes: goodRoutes({}, pages) });
    assert.match(get("A12").reason, /No JSON-LD/);
  });
  test("NOT_APPLICABLE when the client confirms structured data is not used", async () => {
    const { get } = await run({ facts: goodFacts({ usesStructuredData: false }) });
    assert.equal(get("A12").status, "NOT_APPLICABLE");
  });
  test("NOT_ASSESSED when a page could not be read", async () => {
    const { get } = await run({ routes: goodRoutes({ [g("/contact")]: "timeout" }) });
    assert.equal(get("A12").status, "NOT_ASSESSED");
  });
});

describe("crawling rules", () => {
  test("never exceeds the request cap; checks without observations become NOT_ASSESSED with the cap as reason", async () => {
    const { out, transport, get } = await run({ cfg: { maxRequestsPerCheck: 4 } });
    assert.ok(transport.calls.length <= 4, `calls: ${transport.calls.length}`);
    assert.ok(out.requestsUsed <= 4);
    assert.equal(get("A2").status, "NOT_ASSESSED");
    assert.ok(out.budgetNotes.some((n) => /request cap/.test(n)));
  });
  test("respects robots.txt for our own user-agent: a disallowed page is never fetched", async () => {
    const { transport, get } = await run({ routes: goodRoutes({ [g("/robots.txt")]: { status: 200, body: `User-agent: BesigniticsVisibilityCheck\nDisallow: /contact\n\nUser-agent: *\nAllow: /\nSitemap: ${G}/sitemap.xml` } }) });
    assert.ok(!transport.calls.includes(g("/contact")));
    assert.equal(get("A4").pages.find((p) => p.pageUrl === g("/contact"))!.status, "NOT_ASSESSED");
    assert.match(get("A4").pages.find((p) => p.pageUrl === g("/contact"))!.nextStep ?? "", /BesigniticsVisibilityCheck/);
  });
  test("uses key pages from the sitemap when the client gives none", async () => {
    const { out } = await run({ facts: goodFacts({ keyPages: [] }) });
    assert.equal(out.keyPageSource, "sitemap");
    assert.deepEqual(out.keyPages, [g("/pricing"), g("/contact")]);
  });
  test("robots.txt matching: longest rule wins, Allow wins ties, $ anchors, product token only", () => {
    const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\n\nUser-agent: Googlebot/2.1\nDisallow: /nogoogle");
    assert.equal(isAllowed(r, "GPTBot", "/private/x").allowed, false);
    assert.equal(isAllowed(r, "GPTBot", "/private/public/page").allowed, true);
    assert.equal(isAllowed(r, "GPTBot", "/file.pdf").allowed, false);
    assert.equal(isAllowed(r, "GPTBot", "/file.pdf?x=1").allowed, true);
    assert.equal(isAllowed(r, "Googlebot", "/nogoogle").allowed, false);
    assert.equal(isAllowed(r, "Googlebot", "/private").allowed, true, "Googlebot uses only its own group");
    const tie = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a");
    assert.equal(isAllowed(tie, "ClaudeBot", "/a").allowed, true);
  });
  test("URL normalization", () => {
    const tp = ["utm_source", "gclid"];
    assert.equal(normalizeUrl("HTTPS://Example.com:443/a/?utm_source=x&b=2&a=1#top", tp), "https://example.com/a?a=1&b=2");
    assert.notEqual(normalizeUrl("http://example.com/a", tp), normalizeUrl("https://example.com/a", tp));
  });
});
