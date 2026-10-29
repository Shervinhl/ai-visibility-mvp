import { wordBoundaryRegex } from "../checks/html";

/**
 * Question policy, applied to generated, client-supplied, added and edited questions.
 * - No how-to questions: the buyer is asking how to do their own work ("How do I...", "How can we...", steps, workflows).
 * - No business names and no competitor names: the question must be asked without naming any company.
 */

/** First-person or procedural wording that marks a how-to question. "How do most tools charge?" is not how-to. */
const HOWTO_RE = /^\s*(how\s+(to|do|does|can|could|should|would|will)\s+(i|we|you|my|our|your|a\s+(team|agency|founder|business|marketer|creator|company))\b|how\s+to\b|steps\s+to\b|what\s+(are|is)\s+the\s+(best\s+)?steps\b|what(?:'s| is)\s+the\s+best\s+way\b|what\s+is\s+the\s+process\b|walk\s+me\s+through\b)/i;

export function isHowTo(q: string): boolean {
  return HOWTO_RE.test(q);
}

/** Returns the first competitor named in the question, or null. */
export function competitorIn(q: string, competitors: string[]): string | null {
  for (const c of competitors) {
    if (c && wordBoundaryRegex(c).test(q)) return c;
  }
  return null;
}

/** Returns why a question breaks the policy, or null when it is allowed. */
export function questionProblem(q: string, facts: { businessName: string; aliases: string[]; competitors: string[] }): string | null {
  if (isHowTo(q)) return "how-to questions are not used (ask about the buyer's problem, a comparison, a price or a recommendation)";
  for (const term of [facts.businessName, ...facts.aliases]) {
    if (term && wordBoundaryRegex(term).test(q)) return `contains the business name or alias "${term}"`;
  }
  const comp = competitorIn(q, facts.competitors);
  if (comp) return `names the competitor "${comp}" (questions must not name companies)`;
  return null;
}
