import { createHash } from "crypto";
import { escapeRegex, wordBoundaryRegex } from "../checks/html";
import { FactList } from "../facts/types";

/**
 * Part C3: automatic labels for VALID answers. Rule version is stored with every label.
 * AMBIGUOUS mentions and INCORRECT accuracy are never final: they wait for a human label.
 */
export const LABEL_RULES_VERSION = "label-rules-v1";

export type MentionLabel = "MENTIONED" | "NOT_MENTIONED" | "AMBIGUOUS";
export type RecommendLabel = "RECOMMENDED" | "NOT_RECOMMENDED";
export type AccuracyLabel = "CORRECT" | "INCORRECT" | "UNVERIFIABLE";

export interface Claim {
  kind: "price" | "location" | "product" | "buyer";
  text: string;
  verdict: AccuracyLabel;
  reason: string;
}

export interface AutoLabel {
  mentioned: MentionLabel;
  /** null when the mention is AMBIGUOUS (decided by a human). NOT_RECOMMENDED when not mentioned. */
  recommended: RecommendLabel | null;
  /** null when not mentioned, or when AMBIGUOUS. */
  accuracy: AccuracyLabel | null;
  matchedTerm: string | null;
  excerpt: string | null;
  claims: Claim[];
  recommendationEvidence: string[];
  competitorMentions: string[];
  needsReview: boolean;
  reviewReasons: string[];
  ruleVersion: string;
}

const STOPWORDS = new Set(["tool", "tools", "software", "service", "services", "platform", "with", "that", "this", "your", "from", "best", "app", "apps", "and", "the", "for"]);

function sentencesWith(text: string, re: RegExp): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  return sentences.filter((s) => re.test(s));
}

/** The list item or paragraph that contains a mention: from its line to the next list item, heading or blank line. */
function mentionBlocks(text: string, re: RegExp): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  const isBoundary = (l: string) => /^\s*$/.test(l) || /^\s*(\d+[.)]|[-*•])\s+/.test(l) || /^\s*#{1,6}\s/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    let start = i;
    while (start > 0 && !isBoundary(lines[start]) && !/^\s*$/.test(lines[start - 1])) start--;
    let end = i + 1;
    while (end < lines.length && !isBoundary(lines[end])) end++;
    blocks.push(lines.slice(start, end).join("\n"));
  }
  return blocks;
}

const OTHER_SECTION = /\b(other|additional|more|honou?rable|alternative)\s+(options|tools|choices|alternatives|picks|mentions|apps|services|platforms|solutions)\b|\balso (worth considering|consider)\b|\bhonou?rable mentions?\b/i;
const WARNING = /\b(however|but|avoid|not recommended|drawbacks?|downsides?|cons\b|limitations?|lacks?|issues?|complaints?|be aware|caution|beware|mixed reviews|not (?:ideal|great|the best)|outdated|discontinued|reportedly)\b/i;
const ENDORSE = /\b(I(?:'d| would)? recommend|highly recommended|top (?:pick|choice)|best (?:choice|option|pick|overall|for)|great (?:choice|option|fit)|ideal (?:for|choice)|stands? out|go with|first choice|excellent (?:choice|option)|strong (?:choice|option|pick))\b/i;
const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•]|#{1,6})\s+/;

function windowsAround(text: string, re: RegExp, radius = 250): string[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    out.push(text.slice(Math.max(0, m.index - radius), Math.min(text.length, m.index + m[0].length + radius)));
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

function anchorTerms(f: FactList): string[] {
  const terms: string[] = [];
  try {
    terms.push(new URL(f.website).hostname.replace(/^www\./, ""));
  } catch {
    /* ignore */
  }
  terms.push(...f.aliases, ...f.products.map((p) => p.name), ...f.competitors);
  terms.push(...f.productCategory.split(/\s+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase())));
  return terms.filter((t) => t && t.toLowerCase() !== f.businessName.toLowerCase());
}

const MONEY = /(?:(US\$|C\$|CA\$|USD|CAD|EUR|GBP|\$|€|£)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?)|(?:\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(USD|CAD|EUR|GBP|dollars)\b)/g;

function priceClaims(block: string, f: FactList): Claim[] {
  const claims: Claim[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MONEY.source, "g");
  while ((m = re.exec(block))) {
    const intPart = (m[2] ?? m[4] ?? "").replace(/,/g, "");
    const frac = m[3] ?? m[5] ?? "";
    const amount = Number(`${intPart}${frac ? "." + frac : ""}`);
    if (!Number.isFinite(amount)) continue;
    if (!f.prices.length) {
      claims.push({ kind: "price", text: m[0], verdict: "UNVERIFIABLE", reason: "the fact list has no prices" });
      continue;
    }
    const match = f.prices.find((p) => Math.abs(p.amount - amount) < 0.005);
    claims.push(match ? { kind: "price", text: m[0], verdict: "CORRECT", reason: `matches plan "${match.plan}" (${match.amount} ${match.currency}/${match.period})` } : { kind: "price", text: m[0], verdict: "INCORRECT", reason: `no plan in the fact list costs ${amount}` });
  }
  const free = /\bfree (?:plan|tier|version)\b/i.exec(block);
  if (free) {
    if (!f.prices.length) claims.push({ kind: "price", text: free[0], verdict: "UNVERIFIABLE", reason: "the fact list has no prices" });
    else if (f.prices.some((p) => p.amount === 0)) claims.push({ kind: "price", text: free[0], verdict: "CORRECT", reason: "the fact list has a free plan" });
    else claims.push({ kind: "price", text: free[0], verdict: "INCORRECT", reason: "the fact list has no free plan" });
  }
  return claims;
}

function locationClaims(block: string, f: FactList): Claim[] {
  const re = /\b(?:[Bb]ased|[Hh]eadquartered|[Ll]ocated|[Ff]ounded) in ((?:[A-Z][\p{L}.'-]+)(?:,?\s+[A-Z][\p{L}.'-]+){0,3})/gu;
  const claims: Claim[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const place = m[1].replace(/[.]+$/, "");
    if (!f.locations.length) {
      claims.push({ kind: "location", text: m[0], verdict: "UNVERIFIABLE", reason: "the fact list has no location" });
      continue;
    }
    const ok = f.locations.some((loc) => {
      const city = loc.split(",")[0].trim();
      return (city && wordBoundaryRegex(city).test(place)) || wordBoundaryRegex(place.split(",")[0].trim()).test(loc);
    });
    claims.push(ok ? { kind: "location", text: m[0], verdict: "CORRECT", reason: "matches the fact list location" } : { kind: "location", text: m[0], verdict: "INCORRECT", reason: `fact list location is ${f.locations.join("; ")}` });
  }
  return claims;
}

function productClaims(block: string, f: FactList): Claim[] {
  // Only positive matches are detectable reliably; a product the fact list does not list is UNVERIFIABLE, never INCORRECT.
  return f.products.filter((p) => p.name && wordBoundaryRegex(p.name).test(block)).map((p) => ({ kind: "product" as const, text: p.name, verdict: "CORRECT" as const, reason: "product is in the fact list" }));
}

function buyerClaims(block: string, f: FactList): Claim[] {
  const re = /\b(?:ideal for|designed for|built for|aimed at|great for|best for|perfect for)\s+([^.;\n]{3,80})/gi;
  const claims: Claim[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const phrase = m[1].toLowerCase();
    const hit = f.buyers.find((b) =>
      b
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
        .some((w) => phrase.includes(w.replace(/s$/, "")))
    );
    claims.push(hit ? { kind: "buyer", text: m[0], verdict: "CORRECT", reason: `matches buyer type "${hit}"` } : { kind: "buyer", text: m[0], verdict: "UNVERIFIABLE", reason: "buyer description not in the fact list (treated as opinion, never INCORRECT)" });
  }
  return claims;
}

export function labelAnswer(answer: string, f: FactList): AutoLabel {
  const reviewReasons: string[] = [];
  const competitorMentions = f.competitors.filter((c) => c && wordBoundaryRegex(c).test(answer));
  const terms = [f.businessName, ...f.aliases].filter(Boolean);
  let matchedTerm: string | null = null;
  let mentionRe: RegExp | null = null;
  for (const t of terms) {
    const re = wordBoundaryRegex(t);
    if (re.test(answer)) {
      matchedTerm = t;
      mentionRe = new RegExp(terms.map((x) => wordBoundaryRegex(x).source).join("|"), "iu");
      break;
    }
  }
  const base = { claims: [] as Claim[], recommendationEvidence: [] as string[], competitorMentions, ruleVersion: LABEL_RULES_VERSION };
  if (!mentionRe || !matchedTerm) {
    return { ...base, mentioned: "NOT_MENTIONED", recommended: "NOT_RECOMMENDED", accuracy: null, matchedTerm: null, excerpt: null, needsReview: false, reviewReasons };
  }
  const firstIdx = answer.search(mentionRe);
  const excerpt = (firstIdx > 200 ? "…" : "") + answer.slice(Math.max(0, firstIdx - 200), Math.min(answer.length, firstIdx + 300)) + (firstIdx + 300 < answer.length ? "…" : "");
  // Ambiguity: homonym context near a mention, or a common-word name with no anchor near any mention.
  const windows = windowsAround(answer, mentionRe);
  const homonymHits = (f.homonyms ?? []).flatMap((h) =>
    [h.name, ...h.contextTerms]
      .filter((t) => t && t.toLowerCase() !== f.businessName.toLowerCase())
      .filter((t) => windows.some((w) => wordBoundaryRegex(t).test(w)))
      .map((t) => `${h.name}: "${t}"`)
  );
  const anchors = anchorTerms(f).filter((t) => windows.some((w) => new RegExp(escapeRegex(t), "i").test(w)));
  if (homonymHits.length) reviewReasons.push(`possible other organization with the same name (${homonymHits.join(", ")})`);
  if (!homonymHits.length && f.nameIsCommonWord && anchors.length === 0) reviewReasons.push("name is a common word and no product, domain, category or competitor appears near the mention");
  if (reviewReasons.length) {
    return { ...base, mentioned: "AMBIGUOUS", recommended: null, accuracy: null, matchedTerm, excerpt, needsReview: true, reviewReasons };
  }
  // Recommendation.
  const lines = answer.split(/\r?\n/);
  const otherStart = lines.findIndex((l) => OTHER_SECTION.test(l));
  const mentionLines = lines.map((l, i) => ({ l, i })).filter((x) => mentionRe!.test(x.l));
  const mentionSentences = sentencesWith(answer, mentionRe);
  const warning = mentionSentences.find((s) => WARNING.test(s));
  const endorsed = mentionSentences.find((s) => ENDORSE.test(s));
  const shortlisted = mentionLines.find((x) => (otherStart < 0 || x.i < otherStart) && LIST_ITEM.test(x.l) && x.l.search(mentionRe!) <= 80);
  const evidence: string[] = [];
  let recommended: RecommendLabel = "NOT_RECOMMENDED";
  if (warning) evidence.push(`mention has a warning: "${warning.trim().slice(0, 200)}"`);
  else if (endorsed) {
    recommended = "RECOMMENDED";
    evidence.push(`explicit endorsement: "${endorsed.trim().slice(0, 200)}"`);
  } else if (shortlisted) {
    recommended = "RECOMMENDED";
    evidence.push(`in the main shortlist: "${shortlisted.l.trim().slice(0, 200)}"`);
  } else if (otherStart >= 0 && mentionLines.every((x) => x.i > otherStart)) evidence.push(`listed only under "${lines[otherStart].trim().slice(0, 100)}" with no endorsement`);
  else evidence.push("mentioned without a shortlist position or endorsement");
  // Accuracy.
  const blocks = mentionBlocks(answer, mentionRe);
  const scope = blocks.length ? blocks.join("\n") : mentionSentences.join(" ");
  const claims = [...priceClaims(scope, f), ...locationClaims(scope, f), ...productClaims(scope, f), ...buyerClaims(scope, f)];
  let accuracy: AccuracyLabel = "UNVERIFIABLE";
  if (claims.some((c) => c.verdict === "INCORRECT")) accuracy = "INCORRECT";
  else if (claims.some((c) => c.verdict === "CORRECT")) accuracy = "CORRECT";
  if (accuracy === "INCORRECT") reviewReasons.push("an INCORRECT claim needs a human decision");
  return { ...base, mentioned: "MENTIONED", recommended, accuracy, matchedTerm, excerpt, claims, recommendationEvidence: evidence, needsReview: reviewReasons.length > 0, reviewReasons };
}

/** Deterministic 20% sample for double labeling (by run id hash). */
export function inDoubleLabelSample(aiRunId: string): boolean {
  return createHash("sha256").update(aiRunId).digest()[0] % 5 === 0;
}
