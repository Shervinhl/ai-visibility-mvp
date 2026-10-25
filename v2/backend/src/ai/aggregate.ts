import { AccuracyLabel } from "./labeler";
import { AttemptStatus } from "./runner";
import { phrase, Proportion, proportion } from "./stats";

/**
 * Turns final run results (one per question, provider and run) into the counts shown to customers.
 * Labels here are "effective": a human label when present, otherwise the automatic label,
 * except AMBIGUOUS / INCORRECT automatic labels, which stay PENDING_REVIEW until a human decides.
 */

export type EffMention = "MENTIONED" | "NOT_MENTIONED" | "PENDING_REVIEW";
export type EffRecommend = "RECOMMENDED" | "NOT_RECOMMENDED" | "PENDING_REVIEW";
export type EffAccuracy = AccuracyLabel | "PENDING_REVIEW" | null;

export interface FinalRun {
  aiRunId: string;
  batchId: string;
  questionId: string;
  questionText: string;
  questionType: string;
  provider: string;
  model: string;
  runNo: number;
  status: AttemptStatus;
  finishedAt: string;
  mention: EffMention | null;
  recommend: EffRecommend | null;
  accuracy: EffAccuracy;
  excerpt: string | null;
  competitorMentions: string[];
  labelSource: "human" | "auto" | null;
}

export interface CellResult {
  questionId: string;
  questionText: string;
  questionType: string;
  provider: string;
  model: string;
  status: "REPORTED" | "NOT_ASSESSED";
  reason: string | null;
  nextStep: string | null;
  validRuns: number;
  refusals: number;
  errors: number;
  timeouts: number;
  mentioned: { count: number; of: number; pendingReview: number; text: string } | null;
  recommended: { count: number; of: number; pendingReview: number; text: string } | null;
  accuracy: { correct: number; incorrect: number; unverifiable: number; pendingReview: number } | null;
  excerpts: { runNo: number; date: string; excerpt: string }[];
  lastRunAt: string | null;
}

export interface OverallResult {
  scope: string;
  validAnswers: number;
  excludedRefusals: number;
  excludedErrors: number;
  excludedTimeouts: number;
  mentioned: Proportion & { pendingReview: number; text: string };
  recommended: Proportion & { pendingReview: number; text: string };
}

export interface CompetitorResult {
  competitor: string;
  mentionedIn: number;
  of: number;
  text: string;
}

export function aggregateCells(runs: FinalRun[], minValidRuns: number): CellResult[] {
  const keys: string[] = [];
  const groups = new Map<string, FinalRun[]>();
  for (const r of runs) {
    const k = `${r.questionId}|${r.provider}`;
    if (!groups.has(k)) {
      groups.set(k, []);
      keys.push(k);
    }
    groups.get(k)!.push(r);
  }
  return keys.map((k) => {
    const rs = groups.get(k)!.slice().sort((a, b) => a.runNo - b.runNo);
    const first = rs[0];
    const valid = rs.filter((r) => r.status === "VALID");
    const base = {
      questionId: first.questionId,
      questionText: first.questionText,
      questionType: first.questionType,
      provider: first.provider,
      model: first.model,
      validRuns: valid.length,
      refusals: rs.filter((r) => r.status === "REFUSAL").length,
      errors: rs.filter((r) => r.status === "ERROR").length,
      timeouts: rs.filter((r) => r.status === "TIMEOUT").length,
      lastRunAt: rs.map((r) => r.finishedAt).sort().slice(-1)[0] ?? null,
    };
    if (valid.length < minValidRuns) {
      return {
        ...base,
        status: "NOT_ASSESSED" as const,
        reason: `Only ${valid.length} valid run(s) out of ${rs.length} (${base.refusals} refusal, ${base.errors} error, ${base.timeouts} timeout); at least ${minValidRuns} are needed.`,
        nextStep: base.refusals > 0 && base.errors + base.timeouts === 0 ? "Review the refusals; consider rewording the question in a new question-set version." : "Re-run this question set when the provider is available.",
        mentioned: null,
        recommended: null,
        accuracy: null,
        excerpts: [],
      };
    }
    const decidedM = valid.filter((r) => r.mention === "MENTIONED" || r.mention === "NOT_MENTIONED");
    const mCount = decidedM.filter((r) => r.mention === "MENTIONED").length;
    const pendM = valid.filter((r) => r.mention === "PENDING_REVIEW").length;
    const decidedR = valid.filter((r) => r.recommend === "RECOMMENDED" || r.recommend === "NOT_RECOMMENDED");
    const rCount = decidedR.filter((r) => r.recommend === "RECOMMENDED").length;
    const pendR = valid.filter((r) => r.recommend === "PENDING_REVIEW").length;
    const mentionedRuns = valid.filter((r) => r.mention === "MENTIONED");
    const pendingText = (n: number) => (n ? ` (${n} more awaiting human review)` : "");
    return {
      ...base,
      status: "REPORTED" as const,
      reason: null,
      nextStep: null,
      mentioned: { count: mCount, of: decidedM.length, pendingReview: pendM, text: phrase("Mentioned", { count: mCount, of: decidedM.length }) + pendingText(pendM) },
      recommended: { count: rCount, of: decidedR.length, pendingReview: pendR, text: phrase("Recommended", { count: rCount, of: decidedR.length }) + pendingText(pendR) },
      accuracy: {
        correct: mentionedRuns.filter((r) => r.accuracy === "CORRECT").length,
        incorrect: mentionedRuns.filter((r) => r.accuracy === "INCORRECT").length,
        unverifiable: mentionedRuns.filter((r) => r.accuracy === "UNVERIFIABLE").length,
        pendingReview: mentionedRuns.filter((r) => r.accuracy === "PENDING_REVIEW").length,
      },
      excerpts: valid.filter((r) => r.excerpt).map((r) => ({ runNo: r.runNo, date: r.finishedAt, excerpt: r.excerpt! })),
    };
  });
}

/** Overall counts across reported cells only (cells with enough valid runs). */
export function aggregateOverall(runs: FinalRun[], cells: CellResult[], scope: string, minForComparison: number): OverallResult {
  const reported = new Set(cells.filter((c) => c.status === "REPORTED").map((c) => `${c.questionId}|${c.provider}`));
  const inScope = runs.filter((r) => reported.has(`${r.questionId}|${r.provider}`));
  const valid = inScope.filter((r) => r.status === "VALID");
  const dM = valid.filter((r) => r.mention === "MENTIONED" || r.mention === "NOT_MENTIONED");
  const dR = valid.filter((r) => r.recommend === "RECOMMENDED" || r.recommend === "NOT_RECOMMENDED");
  const m = proportion(dM.filter((r) => r.mention === "MENTIONED").length, dM.length, minForComparison);
  const rc = proportion(dR.filter((r) => r.recommend === "RECOMMENDED").length, dR.length, minForComparison);
  const pM = valid.filter((r) => r.mention === "PENDING_REVIEW").length;
  const pR = valid.filter((r) => r.recommend === "PENDING_REVIEW").length;
  return {
    scope,
    validAnswers: valid.length,
    excludedRefusals: runs.filter((r) => r.status === "REFUSAL").length,
    excludedErrors: runs.filter((r) => r.status === "ERROR").length,
    excludedTimeouts: runs.filter((r) => r.status === "TIMEOUT").length,
    mentioned: { ...m, pendingReview: pM, text: phrase("mentioned", m, "valid answers") },
    recommended: { ...rc, pendingReview: pR, text: phrase("recommended", rc, "valid answers") },
  };
}

/** Competitor mention counts (only when the fact list names competitors). No share-of-voice. */
export function aggregateCompetitors(runs: FinalRun[], competitors: string[], cells: CellResult[]): CompetitorResult[] {
  if (!competitors.length) return [];
  const reported = new Set(cells.filter((c) => c.status === "REPORTED").map((c) => `${c.questionId}|${c.provider}`));
  const valid = runs.filter((r) => r.status === "VALID" && reported.has(`${r.questionId}|${r.provider}`));
  return competitors.map((c) => {
    const n = valid.filter((r) => r.competitorMentions.includes(c)).length;
    return { competitor: c, mentionedIn: n, of: valid.length, text: `${c} was mentioned in ${n} of ${valid.length} valid answers` };
  });
}
