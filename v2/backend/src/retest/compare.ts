import { aggregateCells, aggregateOverall, FinalRun, OverallResult } from "../ai/aggregate";

/**
 * Part D: re-test after a fix.
 * A comparison is only allowed when before and after runs used the same frozen question-set version
 * and the same providers with identical settings. The wording never claims cause.
 */

export interface BatchMeta {
  id: string;
  questionSetId: string;
  questionSetVersion: string | null;
  questionSetStatus: string;
  /** provider -> settings JSON exactly as stored with the runs. */
  providerSettings: Record<string, unknown>;
  status: string;
  finishedAt: string | null;
}

/** Stable JSON (sorted keys) so settings compare by value. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function comparisonProblem(before: BatchMeta[], after: BatchMeta[]): string | null {
  if (!before.length || !after.length) return "Pick at least one run from before the change and one from after.";
  const all = [...before, ...after];
  const unfinished = all.filter((b) => b.status !== "DONE");
  if (unfinished.length) return `These runs are not finished: ${unfinished.map((b) => b.id).join(", ")}.`;
  const sets = new Set(all.map((b) => b.questionSetId));
  if (sets.size > 1) return `Blocked: the runs use different question sets (${[...new Set(all.map((b) => b.questionSetVersion ?? b.questionSetId))].join(", ")}). Only runs on the same question-set version can be compared.`;
  if (all[0].questionSetStatus !== "FROZEN") return "Blocked: the question set is not frozen.";
  const ref = stableJson(all[0].providerSettings);
  const diff = all.find((b) => stableJson(b.providerSettings) !== ref);
  if (diff) return `Blocked: run ${diff.id} used different providers or provider settings (model, temperature, tokens, system prompt or tools). Only runs with the same settings can be compared.`;
  return null;
}

export interface SideBySide {
  questionSetVersion: string | null;
  changeDescription: string;
  changedAt: string;
  providers: string[];
  overall: { before: OverallResult; after: OverallResult; statement: string };
  perProvider: { provider: string; before: OverallResult; after: OverallResult; statement: string }[];
  perQuestion: { questionId: string; questionText: string; provider: string; before: string; after: string }[];
  caveat: string;
}

export const CAUSATION_CAVEAT = "This is an observed sample, not proof that the change caused it.";

export function statement(before: OverallResult, after: OverallResult): string {
  return `After the change, the business was mentioned in ${after.mentioned.count} of ${after.mentioned.of} valid answers (before: ${before.mentioned.count} of ${before.mentioned.of}). ${CAUSATION_CAVEAT}`;
}

export function compareRuns(beforeRuns: FinalRun[], afterRuns: FinalRun[], opts: { questionSetVersion: string | null; changeDescription: string; changedAt: string; minValidRuns: number; minForComparison: number }): SideBySide {
  const providers = [...new Set([...beforeRuns, ...afterRuns].map((r) => r.provider))].sort();
  const cb = aggregateCells(beforeRuns, opts.minValidRuns);
  const ca = aggregateCells(afterRuns, opts.minValidRuns);
  const ob = aggregateOverall(beforeRuns, cb, "all providers", opts.minForComparison);
  const oa = aggregateOverall(afterRuns, ca, "all providers", opts.minForComparison);
  const perProvider = providers.map((p) => {
    const b = aggregateOverall(beforeRuns.filter((r) => r.provider === p), cb.filter((c) => c.provider === p), p, opts.minForComparison);
    const a = aggregateOverall(afterRuns.filter((r) => r.provider === p), ca.filter((c) => c.provider === p), p, opts.minForComparison);
    return { provider: p, before: b, after: a, statement: statement(b, a) };
  });
  const describe = (c: (typeof cb)[number] | undefined) => (!c ? "not run" : c.status === "NOT_ASSESSED" ? `NOT_ASSESSED: ${c.reason}` : c.mentioned!.text);
  const keys = [...new Set([...cb, ...ca].map((c) => `${c.questionId}|${c.provider}`))];
  const perQuestion = keys.map((k) => {
    const b = cb.find((c) => `${c.questionId}|${c.provider}` === k);
    const a = ca.find((c) => `${c.questionId}|${c.provider}` === k);
    const any = (b ?? a)!;
    return { questionId: any.questionId, questionText: any.questionText, provider: any.provider, before: describe(b), after: describe(a) };
  });
  return {
    questionSetVersion: opts.questionSetVersion,
    changeDescription: opts.changeDescription,
    changedAt: opts.changedAt,
    providers,
    overall: { before: ob, after: oa, statement: statement(ob, oa) },
    perProvider,
    perQuestion,
    caveat: CAUSATION_CAVEAT,
  };
}
