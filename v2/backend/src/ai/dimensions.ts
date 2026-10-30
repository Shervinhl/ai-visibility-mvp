import { wordBoundaryRegex } from "../checks/html";
import { FactList } from "../facts/types";

/**
 * Measurement dimensions for "Does AI mention you?" (rules version dimensions-v1).
 * Deterministic and explainable: every classification carries the sentence or line that caused it.
 * Semantic judgments that rules cannot make reliably (implicit references, a model-based intent judge)
 * are NOT made here; they are reported as "not measured".
 */

export type MentionType = "explicit" | "alias" | "none";
export type RecStrength = "strong" | "qualified" | "neutral" | "negative" | "none" | "uncertain";
export type Prominence = "high" | "medium" | "low" | "not_applicable" | "uncertain";
export type IntentStatus = "fully_addressed" | "partially_addressed" | "poorly_addressed" | "not_addressed" | "uncertain";
export type PrimaryIntent = "discovery" | "informational" | "use_case" | "comparison" | "recommendation" | "purchase_decision" | "local" | "other";

export interface BrandSignal {
  name: string;
  mentioned: boolean;
  strength: RecStrength;
  /** Explicit position in a numbered list in the main answer only. Never inferred from text order. */
  rank: number | null;
  prominence: Prominence;
  /** Order of first mention among the tracked brands in this answer (1 = first). Not a ranking. */
  order: number | null;
  evidence: string | null;
}

export interface IntentResult {
  primary: PrimaryIntent;
  requirements: string[];
  covered: string[];
  missed: string[];
  status: IntentStatus;
  ratio: number | null;
}

export interface BrandEvaluation {
  target: BrandSignal;
  competitors: BrandSignal[];
  mentionType: MentionType;
  matchedTerm: string | null;
  /** Matches the business name or any approved alias. Null when the business is not mentioned. */
  targetRe: RegExp | null;
}

export const OTHER_SECTION = /\b(other|additional|more|honou?rable|alternative)\s+(options|tools|choices|alternatives|picks|mentions|apps|services|platforms|solutions)\b|\b(also (worth considering|consider))\b|\bhonou?rable mentions?\b/i;
export const WARNING = /\b(however|but|avoid|not recommended|drawbacks?|downsides?|cons\b|limitations?|lacks?|issues?|complaints?|be aware|caution|beware|mixed reviews|not (?:ideal|great|the best)|outdated|discontinued|reportedly)\b/i;
export const ENDORSE = /\b(I(?:'d| would)? recommend|highly recommended|top (?:pick|choice)|best (?:choice|option|pick|overall|for)|great (?:choice|option|fit)|ideal (?:for|choice)|stands? out|go with|first choice|excellent (?:choice|option)|strong (?:choice|option|pick))\b/i;
/** Conditions or use cases that turn a positive mention into a qualified recommendation. */
export const CONDITION = /\b(if you|if your|when you|may be|might be|could be|suitable for|good fit|best if|especially (?:for|if)|particularly (?:for|if)|for (?:teams|businesses|creators|agencies|podcasters|small|smaller|enterprises|beginners|freelancers|marketers|students|startups))\b/i;
export const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•]|#{1,6})\s+/;

export function sentencesWith(text: string, re: RegExp): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  return sentences.filter((s) => re.test(s));
}

function clip(s: string): string {
  return s.trim().slice(0, 200);
}

function nonGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.replace("g", ""));
}

function signal(answer: string, re: RegExp, name: string): BrandSignal {
  const lineRe = nonGlobal(re);
  if (answer.search(lineRe) < 0) return { name, mentioned: false, strength: "none", rank: null, prominence: "not_applicable", order: null, evidence: null };
  const lines = answer.split(/\r?\n/);
  const otherStart = lines.findIndex((l) => OTHER_SECTION.test(l));
  const hitLines = lines.map((_, i) => i).filter((i) => lineRe.test(lines[i]));
  const sentences = sentencesWith(answer, lineRe);

  const warning = sentences.find((s) => WARNING.test(s));
  const endorsed = sentences.find((s) => ENDORSE.test(s));
  const conditional = sentences.find((s) => CONDITION.test(s));
  let strength: RecStrength;
  let evidence: string;
  if (warning) {
    strength = "negative";
    evidence = `mention has a warning: "${clip(warning)}"`;
  } else if (endorsed) {
    if (CONDITION.test(endorsed)) {
      strength = "qualified";
      evidence = `conditional endorsement: "${clip(endorsed)}"`;
    } else {
      strength = "strong";
      evidence = `explicit endorsement: "${clip(endorsed)}"`;
    }
  } else if (conditional) {
    strength = "qualified";
    evidence = `conditional fit: "${clip(conditional)}"`;
  } else {
    strength = "neutral";
    evidence = "mentioned without a recommendation";
  }

  const mainHits = hitLines.filter((i) => otherStart < 0 || i < otherStart);
  const inOther = otherStart >= 0 && mainHits.length === 0;
  const mainLine = mainHits.length ? lines[mainHits[0]] : null;
  const rankMatch = mainLine ? /^\s*(\d+)[.)]\s/.exec(mainLine) : null;
  const rank = rankMatch ? Number(rankMatch[1]) : null;
  const inList = mainLine !== null && LIST_ITEM.test(mainLine);

  let prominence: Prominence;
  if (inOther || strength === "negative") prominence = "low";
  else if (rank === 1) prominence = "high";
  else if (rank !== null) prominence = "medium";
  else if (strength === "strong") prominence = "high";
  else if (strength === "qualified" || inList) prominence = "medium";
  else prominence = "low";

  return { name, mentioned: true, strength, rank, prominence, order: null, evidence };
}

/** Evaluates the target business and every configured competitor against one answer. */
export function evaluateBrands(answer: string, f: FactList): BrandEvaluation {
  // Longest first, so "Flowjin AI" is reported as an alias rather than as the shorter business name.
  const terms = [f.businessName, ...f.aliases].filter(Boolean).sort((a, b) => b.length - a.length);
  let matchedTerm: string | null = null;
  for (const t of terms) {
    if (wordBoundaryRegex(t).test(answer)) {
      matchedTerm = t;
      break;
    }
  }
  const targetRe = matchedTerm ? new RegExp(terms.map((x) => wordBoundaryRegex(x).source).join("|"), "iu") : null;
  const target = targetRe ? signal(answer, targetRe, f.businessName) : noTarget(f.businessName);
  const competitors = f.competitors.filter((c) => c).map((c) => signal(answer, wordBoundaryRegex(c), c));

  // Mention order: first appearance in the text among brands that were mentioned.
  const firsts = [target, ...competitors]
    .filter((b) => b.mentioned)
    .map((b) => {
      const re = b === target && targetRe ? targetRe : wordBoundaryRegex(b.name);
      return { b, at: answer.search(nonGlobal(re)) };
    })
    .sort((x, y) => x.at - y.at);
  firsts.forEach((x, i) => (x.b.order = i + 1));

  return {
    target,
    competitors,
    mentionType: matchedTerm === null ? "none" : matchedTerm === f.businessName ? "explicit" : "alias",
    matchedTerm,
    targetRe,
  };
}

const REQ_STOP = new Set([
  "what", "which", "who", "where", "when", "why", "how", "best", "top", "good", "better", "most", "many", "more", "much", "very", "just",
  "tool", "tools", "software", "platform", "platforms", "app", "apps", "service", "services", "solution", "solutions", "option", "options",
  "for", "with", "from", "that", "this", "there", "your", "yours", "mine", "have", "has", "does", "should", "would", "could", "will", "can",
  "need", "needs", "want", "wants", "make", "use", "using", "get", "the", "and", "are", "is", "its", "not", "but", "out", "all", "any", "one",
  "into", "about", "than", "then", "over", "like", "also", "they", "them", "their", "via", "recommend", "recommendation", "vs", "versus",
  "compare", "comparison", "alternative", "alternatives", "price", "pricing", "cost", "value", "worth", "free", "ideal", "good", "our", "you",
]);

/** Words the question asks for (its requirements). Intent words and generic words are removed. */
export function requirementWords(question: string): string[] {
  return [...new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !REQ_STOP.has(w)))];
}

const INTENT_RULES: [PrimaryIntent, RegExp][] = [
  ["comparison", /\bvs\.?\b|\bversus\b|\bcompar|\balternatives? to\b|\bbetter than\b/i],
  ["purchase_decision", /\b(price|prices|pricing|cost|costs|value for money|worth it|worth buying|free plan|cheapest|budget)\b/i],
  ["recommendation", /\b(best|top|recommend\w*|should i (?:use|choose|buy|pick))\b/i],
  ["use_case", /\b(?:for|to) (?:a|an|my|our|your|small|large|the|teams?|businesses?|creators?|agencies?|podcasters?|marketers?|students?|startups?)\b/i],
  ["informational", /^\s*(?:what (?:is|are|does)|who is|explain)\b/i],
  ["discovery", /\b(?:what|which|list)\b|\b(?:tools?|options?|ways?) (?:for|to)\b/i],
];

export function primaryIntent(question: string): PrimaryIntent {
  // Local intent needs the place name's capital letter, so it is checked on the original text.
  if (/\bnear me\b|\bnearby\b/i.test(question) || /\bin [A-Z]/.test(question)) return "local";
  for (const [intent, re] of INTENT_RULES) if (re.test(question)) return intent;
  return "other";
}

/**
 * Lexical requirement coverage: which of the question's requirement words appear (or share a stem) in the answer.
 * A first-pass heuristic. It cannot tell whether the answer actually addresses a requirement; an LLM judge is needed for that.
 */
export function intentCoverage(question: string, answer: string | null): IntentResult {
  const primary = primaryIntent(question);
  const requirements = requirementWords(question);
  if (!answer || !answer.trim() || requirements.length === 0) {
    return { primary, requirements, covered: [], missed: requirements, status: "uncertain", ratio: null };
  }
  const text = answer.toLowerCase();
  const covered = requirements.filter((w) => text.includes(w.slice(0, Math.max(4, w.length - 2))));
  const missed = requirements.filter((w) => !covered.includes(w));
  const ratio = covered.length / requirements.length;
  const status: IntentStatus = ratio >= 0.8 ? "fully_addressed" : ratio >= 0.4 ? "partially_addressed" : ratio > 0 ? "poorly_addressed" : "not_addressed";
  return { primary, requirements, covered, missed, status, ratio };
}

/** The stored, per-answer dimension record (kept inside the automatic label's details). */
export interface RunDimensions {
  rulesVersion: string;
  mentionType: MentionType;
  target: BrandSignal;
  competitors: BrandSignal[];
  intent: IntentResult | null;
  /** Price, location, product and buyer claims found in the mention, with their verdicts. */
  claims: { kind: string; verdict: "CORRECT" | "INCORRECT" | "UNVERIFIABLE" }[];
  citations: { availability: "not_available_from_provider" | "available"; sources: string[] };
}

export const DIMENSIONS_RULES_VERSION = "dimensions-v1";

export function noTarget(name: string): BrandSignal {
  return { name, mentioned: false, strength: "none", rank: null, prominence: "not_applicable", order: null, evidence: null };
}
