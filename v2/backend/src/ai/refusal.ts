/**
 * Part C2: simple rule set for refusals.
 * - Provider-reported refusal or safety block: REFUSAL.
 * - Empty answer: REFUSAL, flagged for review.
 * - Refusal phrase in a short answer (under 400 characters): REFUSAL.
 * - Refusal phrase in a longer answer: VALID, flagged for review ("possible partial refusal").
 */
export const REFUSAL_RULES_VERSION = "refusal-rules-v1";

const REFUSAL_PATTERNS: RegExp[] = [
  /\bI(?:'m| am) (?:not able|unable) to (?:help|assist|provide|answer|recommend)/i,
  /\bI (?:can(?:no|')t|cannot|won't|will not) (?:help|assist|provide|answer|recommend|comply)/i,
  /\bI(?:'m| am) sorry,? but I (?:can(?:no|')t|cannot|won't)/i,
  /\bI (?:must|have to) decline\b/i,
  /\bas an AI,? I (?:can(?:no|')t|cannot|don't)/i,
];

export const SHORT_ANSWER_CHARS = 400;

export interface RefusalVerdict {
  refusal: boolean;
  needsReview: boolean;
  rule: string;
}

export function detectRefusal(text: string, providerRefusal: boolean): RefusalVerdict {
  if (providerRefusal) return { refusal: true, needsReview: false, rule: "provider reported a refusal or safety block" };
  const t = text.trim();
  if (!t) return { refusal: true, needsReview: true, rule: "empty answer" };
  const hit = REFUSAL_PATTERNS.find((p) => p.test(t));
  if (!hit) return { refusal: false, needsReview: false, rule: "no refusal phrase" };
  if (t.length < SHORT_ANSWER_CHARS) return { refusal: true, needsReview: false, rule: `refusal phrase in a short answer (${hit.source})` };
  return { refusal: false, needsReview: true, rule: `refusal phrase in a long answer; possible partial refusal (${hit.source})` };
}
