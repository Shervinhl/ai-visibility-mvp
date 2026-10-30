import { AccuracyLabel } from "./labeler";
import { AttemptStatus } from "./runner";
import type { RunDimensions } from "./dimensions";
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
  /** The full answer the provider gave (valid runs only). */
  answerText: string | null;
  /** The provider's error message for an ERROR or TIMEOUT run, if any. */
  error: string | null;
  /** The business name or alias the automatic labeler matched, if any. */
  matchedTerm: string | null;
  competitorMentions: string[];
  /** Per-answer dimensions from the automatic label (absent for answers labeled before dimensions-v1). */
  dims?: RunDimensions | null;
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
  /** Full answers from valid runs where the business was not mentioned, so the customer can read what the AI said. */
  answersNotMentioning: { runNo: number; date: string; text: string; labelSource: "human" | "auto" | null }[];
  /** Full answers from valid runs that name the business, with the term that matched and whether it was recommended. */
  answersNamed: { runNo: number; date: string; text: string; matchedTerm: string | null; recommended: boolean; labelSource: "human" | "auto" | null }[];
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
  /** Valid answers whose label is still the automatic one (no person has checked them yet). */
  autoLabelOnly: number;
}

/**
 * Which providers gave valid answers for reported cells. Fewer than two means the result is preliminary:
 * it is one provider's answers, not a comparison.
 */
export function providerCoverage(cells: CellResult[]): { reporting: string[]; preliminary: boolean; note: string | null } {
  const reporting = [...new Set(cells.filter((c) => c.status === "REPORTED").map((c) => c.provider))].sort();
  const preliminary = reporting.length < 2;
  const note = preliminary
    ? `Preliminary: only ${reporting.length} provider${reporting.length === 1 ? "" : "s"} gave valid answers${reporting.length ? ` (${reporting.join(", ")})` : ""}. At least two are needed, so this is not a comparison yet.`
    : null;
  return { reporting, preliminary, note };
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
    const firstError = rs.find((r) => (r.status === "ERROR" || r.status === "TIMEOUT") && r.error)?.error ?? null;
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
        reason: `Only ${valid.length} valid run(s) out of ${rs.length} (${base.refusals} refusal, ${base.errors} error, ${base.timeouts} timeout); at least ${minValidRuns} are needed.${firstError ? ` Error from ${first.provider}: ${firstError}` : ""}`,
        nextStep: base.refusals > 0 && base.errors + base.timeouts === 0 ? "Review the refusals; consider rewording the question in a new question-set version." : "Re-run this question set when the provider is available.",
        mentioned: null,
        recommended: null,
        accuracy: null,
        excerpts: [],
        answersNotMentioning: [],
        answersNamed: [],
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
      answersNotMentioning: valid
        .filter((r) => r.mention !== "MENTIONED" && r.answerText)
        .map((r) => ({ runNo: r.runNo, date: r.finishedAt, text: r.answerText!, labelSource: r.labelSource })),
      answersNamed: valid
        .filter((r) => r.mention === "MENTIONED" && r.answerText)
        .map((r) => ({ runNo: r.runNo, date: r.finishedAt, text: r.answerText!, matchedTerm: r.matchedTerm, recommended: r.recommend === "RECOMMENDED", labelSource: r.labelSource })),
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
    autoLabelOnly: valid.filter((r) => r.labelSource === "auto").length,
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

export interface DimensionRow {
  name: string;
  mentioned: Proportion;
  recommended: Proportion;
  strongRecommendation: Proportion;
  highProminence: Proportion;
}

export interface DimensionReport {
  rulesVersion: string;
  /** Valid answers in reported cells. */
  validAnswers: number;
  /** Valid answers with automatic dimensions that are not AMBIGUOUS. Every rate below uses this as its denominator. */
  measured: number;
  /** Valid answers still AMBIGUOUS (no dimensions until a person decides). */
  pendingAmbiguous: number;
  /** Valid answers labeled before dimensions-v1 existed (re-run the test to measure them). */
  noDimensionData: number;
  mention: Proportion;
  explicitMention: Proportion;
  aliasMention: Proportion;
  /** Null: implicit references are not measured by the rules (see notMeasured). */
  implicitReference: null;
  recommendation: Proportion;
  strongRecommendation: Proportion;
  negativeMention: Proportion;
  highProminence: Proportion;
  brandAccuracy: { correct: number; incorrect: number; unverifiable: number; evaluable: number; rate: Proportion | null; note: string | null };
  intentAlignment: { measured: number; fully: Proportion; partially: Proportion; poorly: number; notAddressed: number; note: string };
  citationAvailability: { available: number; of: number; note: string };
  target: DimensionRow;
  competitors: DimensionRow[];
  competitorComparison: { competitorRecommendedTargetNot: number; bothRecommended: number; targetRecommendedCompetitorNot: number; neitherRecommended: number; of: number };
  notMeasured: string[];
}

/**
 * Dimension metrics (dimensions-v1). They come from the automatic dimensions, not from human overrides:
 * human decisions still change the headline counts, but not these per-dimension fields.
 */
export function aggregateDimensions(runs: FinalRun[], cells: CellResult[], competitors: string[], minForComparison: number): DimensionReport {
  const reported = new Set(cells.filter((c) => c.status === "REPORTED").map((c) => `${c.questionId}|${c.provider}`));
  const valid = runs.filter((r) => r.status === "VALID" && reported.has(`${r.questionId}|${r.provider}`));
  const withDims = valid.filter((r) => r.dims);
  const pendingAmbiguous = withDims.filter((r) => r.dims!.target.strength === "uncertain").length;
  const m = withDims.filter((r) => r.dims!.target.strength !== "uncertain").map((r) => r.dims!);
  const N = m.length;
  const isRec = (s: string) => s === "strong" || s === "qualified";
  const p = (count: number) => proportion(count, N, minForComparison);
  const rowFor = (name: string, pick: (d: RunDimensions) => BrandSignalLike): DimensionRow => {
    const sig = (d: RunDimensions) => pick(d);
    return {
      name,
      mentioned: proportion(m.filter((d) => sig(d).mentioned).length, N, minForComparison),
      recommended: proportion(m.filter((d) => isRec(sig(d).strength)).length, N, minForComparison),
      strongRecommendation: proportion(m.filter((d) => sig(d).strength === "strong").length, N, minForComparison),
      highProminence: proportion(m.filter((d) => sig(d).prominence === "high").length, N, minForComparison),
    };
  };
  const targetRow = rowFor("target", (d) => d.target);
  const compRows = competitors.map((name) => rowFor(name, (d) => d.competitors.find((c) => c.name === name) ?? { mentioned: false, strength: "none", prominence: "not_applicable" }));

  const claims = m.flatMap((d) => (d.target.mentioned ? d.claims : []));
  const correct = claims.filter((c) => c.verdict === "CORRECT").length;
  const incorrect = claims.filter((c) => c.verdict === "INCORRECT").length;
  const unverifiable = claims.filter((c) => c.verdict === "UNVERIFIABLE").length;
  const evaluable = correct + incorrect;

  const intents = m.filter((d) => d.intent && d.intent.status !== "uncertain").map((d) => d.intent!.status);
  const fully = intents.filter((s) => s === "fully_addressed").length;
  const partially = intents.filter((s) => s === "partially_addressed").length;
  const compRec = (d: RunDimensions) => d.competitors.some((c) => isRec(c.strength));
  const tRec = (d: RunDimensions) => isRec(d.target.strength);
  const cnt = (f: (d: RunDimensions) => boolean) => m.filter(f).length;

  const avail = withDims.length;
  const availableCount = withDims.filter((r) => r.dims!.citations.availability === "available").length;

  return {
    rulesVersion: "dimensions-v1",
    validAnswers: valid.length,
    measured: N,
    pendingAmbiguous,
    noDimensionData: valid.length - withDims.length,
    mention: p(cnt((d) => d.target.mentioned)),
    explicitMention: p(cnt((d) => d.target.mentioned && d.mentionType === "explicit")),
    aliasMention: p(cnt((d) => d.target.mentioned && d.mentionType === "alias")),
    implicitReference: null,
    recommendation: p(cnt((d) => isRec(d.target.strength))),
    strongRecommendation: p(cnt((d) => d.target.strength === "strong")),
    negativeMention: p(cnt((d) => d.target.strength === "negative")),
    highProminence: p(cnt((d) => d.target.prominence === "high")),
    brandAccuracy: {
      correct,
      incorrect,
      unverifiable,
      evaluable,
      rate: evaluable ? proportion(correct, evaluable, minForComparison) : null,
      note: evaluable ? null : "No evaluable claims yet (only CORRECT or INCORRECT claims count). No accuracy rate is shown.",
    },
    intentAlignment: {
      measured: intents.length,
      fully: proportion(fully, intents.length, minForComparison),
      partially: proportion(partially, intents.length, minForComparison),
      poorly: intents.filter((s) => s === "poorly_addressed").length,
      notAddressed: intents.filter((s) => s === "not_addressed").length,
      note: "Lexical requirement coverage: the share of the question's requirement words that appear in the answer. It does not judge whether the answer really resolves the question.",
    },
    citationAvailability: {
      available: availableCount,
      of: avail,
      note: availableCount === 0 ? "Not available from provider: no connected provider returns citations or sources." : `${availableCount} of ${avail} answers exposed citations.`,
    },
    target: targetRow,
    competitors: compRows,
    competitorComparison: {
      competitorRecommendedTargetNot: cnt((d) => compRec(d) && !tRec(d)),
      bothRecommended: cnt((d) => compRec(d) && tRec(d)),
      targetRecommendedCompetitorNot: cnt((d) => !compRec(d) && tRec(d)),
      neitherRecommended: cnt((d) => !compRec(d) && !tRec(d)),
      of: N,
    },
    notMeasured: [
      "Implicit references: not measured. Detecting them needs a semantic judge, which is not built yet.",
      "Citations: not available from the current providers, so no source analysis is shown.",
      "Intent alignment: lexical coverage only, not a judgment of whether the answer resolves the question.",
      "Dimensions come from the automatic rules. Human decisions change the headline counts, not these fields.",
    ],
  };
}

type BrandSignalLike = { mentioned: boolean; strength: string; prominence: string };
