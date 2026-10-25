import { CheckId, CheckOutcome, CheckStatus } from "../checks/types";

/**
 * Part E: customer-facing wording. Each finding says what was checked, what was found, why it matters,
 * what to change and how to re-test. No single number, grade or "score" is ever produced.
 */

interface CheckCopy {
  whatChecked: string;
  whyItMatters: string;
  howToRetest: string;
}

export const CHECK_COPY: Record<CheckId, CheckCopy> = {
  A1: {
    whatChecked: "Whether your robots.txt lets GPTBot, ClaudeBot, PerplexityBot, Googlebot and Bingbot fetch your homepage and key pages.",
    whyItMatters: "If a crawler is blocked, that AI tool or search engine cannot read the page, so it cannot use your own words when it answers.",
    howToRetest: "Update robots.txt, then run the technical checks again.",
  },
  A2: {
    whatChecked: "Whether each key page returns a normal success response (HTTP 200) on three separate tries, with no redirect loop.",
    whyItMatters: "Pages that error or loop are skipped by crawlers, so their content never reaches AI tools.",
    howToRetest: "Fix the server or redirect, then run the technical checks again.",
  },
  A3: {
    whatChecked: "Whether the main text of each page is in the HTML your server sends, without running JavaScript.",
    whyItMatters: "Many AI crawlers do not run JavaScript. Text that only appears after scripts run is invisible to them.",
    howToRetest: "Server-render the content, then run the technical checks again (with browser rendering installed).",
  },
  A4: {
    whatChecked: "Whether each key page has one clear, unique title and exactly one main heading in its HTML.",
    whyItMatters: "Titles and main headings are the strongest plain signals of what a page is about.",
    howToRetest: "Fix the title or heading, then run the technical checks again.",
  },
  A5: {
    whatChecked: "Whether each key page has a meta description of 50 to 160 characters.",
    whyItMatters: "The description is a short, plain summary that tools can quote or use to understand the page.",
    howToRetest: "Add or rewrite the description, then run the technical checks again.",
  },
  A6: {
    whatChecked: "Whether your business name, what you do, your location and how to contact you appear as real text on the homepage or the contact/about page.",
    whyItMatters: "AI tools read text, not pictures. Details that only appear inside images cannot be read or repeated correctly.",
    howToRetest: "Add the details as text, then run the technical checks again.",
  },
  A7: {
    whatChecked: "Whether each price in your fact list appears as text in the HTML of the page that lists it.",
    whyItMatters: "Prices loaded by scripts or shown in images cannot be read by most AI crawlers, so answers about cost may be wrong or missing.",
    howToRetest: "Put the prices in the HTML, then run the technical checks again.",
  },
  A8: {
    whatChecked: "Whether each key page has exactly one canonical tag that points to its own address.",
    whyItMatters: "A wrong canonical tells crawlers to use a different page instead of this one.",
    howToRetest: "Fix the canonical tag, then run the technical checks again.",
  },
  A9: {
    whatChecked: "Whether any key page has noindex or none in its meta robots tags or its X-Robots-Tag header.",
    whyItMatters: "A noindex directive asks search engines and AI tools not to use the page at all.",
    howToRetest: "Remove the directive, then run the technical checks again.",
  },
  A10: {
    whatChecked: "Whether your XML sitemap exists, loads, parses, is referenced in robots.txt and lists every key page.",
    whyItMatters: "The sitemap is how crawlers find your important pages quickly and completely.",
    howToRetest: "Update the sitemap and robots.txt, then run the technical checks again.",
  },
  A11: {
    whatChecked: "Whether every key page can be reached from the homepage by following normal links, within 4 clicks.",
    whyItMatters: "Pages with no path of links from the homepage are hard for crawlers to discover.",
    howToRetest: "Add the links, then run the technical checks again.",
  },
  A12: {
    whatChecked: "Whether JSON-LD structured data exists on the homepage or key pages, and whether every block is valid JSON.",
    whyItMatters: "Structured data states facts (name, products, prices) in a form machines read reliably. Broken JSON is ignored.",
    howToRetest: "Fix or add the JSON-LD, then run the technical checks again.",
  },
};

export interface Finding {
  checkId: CheckId;
  title: string;
  status: CheckStatus;
  whatChecked: string;
  whatFound: string;
  whyItMatters: string;
  whatToChange: string;
  howToRetest: string;
  /** One line the customer sees first. */
  headline: string;
}

function stripNeeds(s: string): string {
  return s.replace(/^Needs:\s*/i, "").replace(/\.$/, "");
}

export function notAssessedLine(nextStep: string | null): string {
  return `We could not check this yet. Needs: ${stripNeeds(nextStep ?? "a re-run of the check")}.`;
}

export function notApplicableLine(reason: string): string {
  const r = reason.replace(/^Does not apply:\s*/i, "").replace(/\.$/, "");
  return `Does not apply to this page because ${r.charAt(0).toLowerCase()}${r.slice(1)}.`;
}

export function findingFor(o: CheckOutcome): Finding {
  const copy = CHECK_COPY[o.checkId];
  let headline: string;
  let whatToChange: string;
  switch (o.status) {
    case "PASS":
      headline = `Passed: ${o.reason}`;
      whatToChange = "Nothing to change.";
      break;
    case "FAIL":
      headline = `Needs a fix: ${o.reason}`;
      whatToChange = o.nextStep ?? "See the evidence for details.";
      break;
    case "NOT_ASSESSED":
      headline = notAssessedLine(o.nextStep);
      whatToChange = `Next step: ${o.nextStep ?? "re-run the check"}`;
      break;
    case "NOT_APPLICABLE":
      headline = notApplicableLine(o.reason);
      whatToChange = "Nothing to change.";
      break;
  }
  return { checkId: o.checkId, title: o.name, status: o.status, whatChecked: copy.whatChecked, whatFound: o.reason, whyItMatters: copy.whyItMatters, whatToChange, howToRetest: copy.howToRetest, headline };
}

export const AI_SECTION_COPY = {
  whatChecked: "Whether AI assistants mention you, recommend you, and describe you correctly when asked real buyer questions that do not name you.",
  whyItMatters: "This measures the outcome directly: what buyers actually see when they ask an AI assistant.",
  howToRetest: "Re-run the same frozen question set with the same providers and settings, then compare before and after.",
};

/** Phrases that must never appear in customer-facing output (Part E). */
export const BANNED_PHRASES = [/ai ranking score/i, /ai visibility score/i, /\boverall score\b/i, /\bgrade\b/i];

export function findBannedPhrase(text: string): string | null {
  const hit = BANNED_PHRASES.find((p) => p.test(text));
  return hit ? hit.source : null;
}
