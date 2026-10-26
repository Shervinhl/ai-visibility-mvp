import { test } from "node:test";
import assert from "node:assert/strict";
import { isLegalPage } from "../src/checks/checks";
import { notAssessedLine } from "../src/wording/catalog";

test("legal and policy pages are recognised", () => {
  for (const u of ["https://x.com/terms", "https://x.com/privacy-policy", "https://x.com/creator-agreement", "https://x.com/copyright-dispute", "https://x.com/cookies/"]) {
    assert.equal(isLegalPage(u), true, u);
  }
});

test("marketing and blog pages are not legal pages", () => {
  for (const u of ["https://x.com/", "https://x.com/pricing", "https://x.com/blog/new-features-in-november"]) {
    assert.equal(isLegalPage(u), false, u);
  }
});

test("Needs is only used for client inputs; technical retries say Next step", () => {
  assert.equal(notAssessedLine("Needs: your fact list."), "We could not check this yet. Needs: your fact list.");
  assert.equal(notAssessedLine("Re-run the check; if rendering keeps timing out, the page may need fewer scripts."), "We could not check this yet. Next step: Re-run the check; if rendering keeps timing out, the page may need fewer scripts.");
});

import { metadataSuggestion, parseAiSuggestion } from "../src/facts/suggest";

test("page metadata fills name, description, email and contact page", () => {
  const html = `<html><head><title>Flowjin | Short videos</title><meta name="description" content="Turn long videos into short clips."><meta property="og:site_name" content="Flowjin"></head>
  <body><a href="/contact">Contact</a> Write to hello@flowjin.com</body></html>`;
  const s = metadataSuggestion(html, "https://www.flowjin.com/");
  assert.equal(s.businessName, "Flowjin");
  assert.equal(s.whatItDoes, "Turn long videos into short clips.");
  assert.equal(s.contactEmail, "hello@flowjin.com");
  assert.equal(s.contactUrl, "https://www.flowjin.com/contact");
});

test("AI reply is read even when wrapped in text; bad replies return null", () => {
  assert.deepEqual(parseAiSuggestion('Here: {"businessName":"Acme","buyers":["Teams"]} done')?.businessName, "Acme");
  assert.equal(parseAiSuggestion("no json here"), null);
});

import { conformToRules } from "../src/facts/suggest";

test("AI values are trimmed to the fact list rules and the reason is reported", () => {
  const competitors = Array.from({ length: 12 }, (_, i) => `Rival ${i}`);
  const { value, notes } = conformToRules(
    {
      businessName: " Flowjin ", aliases: [], whatItDoes: "x", productCategory: "tool", products: [], buyers: ["Creators"], locations: [],
      contactEmail: "not-an-email", contactPhone: "", contactUrl: "mailto:a@b.com", prices: [{ plan: "Pro", amount: 29, currency: "usd", period: "month", pageUrl: "bad" }],
      shortPhrase: "one two", serviceArea: "", competitors, keyPages: ["https://x.com/", "nope"],
    } as never,
    20
  );
  assert.equal(value.competitors.length, 10);
  assert.equal(value.keyPages.length, 1);
  assert.equal(value.contactEmail, "");
  assert.equal(value.contactUrl, "");
  assert.equal(value.prices[0].currency, "USD");
  assert.equal(value.prices[0].pageUrl, "");
  assert.equal(value.shortPhrase, "");
  assert.equal(value.businessName, "Flowjin");
  assert.ok(notes.some((n) => n.startsWith("Competitors")));
});
