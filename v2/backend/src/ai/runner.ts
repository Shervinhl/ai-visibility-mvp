import { AiConfig } from "../config";
import { AiProvider, ProviderHttpError, ProviderTimeoutError, ProviderSettings } from "./providers";
import { detectRefusal, REFUSAL_RULES_VERSION } from "./refusal";

/**
 * Part C2: run each approved question N times per provider.
 * Retries only on timeout, 429 and 5xx (up to cfg.maxAttempts attempts per run), exponential backoff with
 * jitter, Retry-After respected. Every attempt is recorded with its full raw response.
 */

export type AttemptStatus = "VALID" | "REFUSAL" | "ERROR" | "TIMEOUT";

export interface AttemptRecord {
  questionId: string;
  provider: string;
  model: string;
  settings: ProviderSettings;
  runNo: number;
  attemptNo: number;
  status: AttemptStatus;
  httpStatus: number | null;
  /** Full raw response body (or error body). */
  rawResponse: string;
  /** Extracted answer text (empty for errors). */
  answerText: string;
  finishReason: string | null;
  error: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  refusalRulesVersion: string;
  /** True for the attempt whose status counts for this run (the last one). */
  isFinal: boolean;
  startedAt: string;
  finishedAt: string;
}

export interface RunDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  random: () => number;
}

export interface RunQuestion {
  id: string;
  text: string;
}

function parseRetryAfter(v: string | undefined, now: Date): number | null {
  if (!v) return null;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : Math.max(0, d - now.getTime());
}

/** One run of one question on one provider: up to cfg.maxAttempts attempts. */
export async function runOnce(p: AiProvider, q: RunQuestion, runNo: number, cfg: AiConfig, deps: RunDeps): Promise<AttemptRecord[]> {
  const records: AttemptRecord[] = [];
  for (let attemptNo = 1; attemptNo <= cfg.maxAttempts; attemptNo++) {
    const startedAt = deps.now().toISOString();
    const base = { questionId: q.id, provider: p.name, model: p.model, settings: p.settings, runNo, attemptNo, refusalRulesVersion: REFUSAL_RULES_VERSION, isFinal: false, startedAt };
    let retryAfterMs: number | null = null;
    let retryable = false;
    try {
      const reply = await p.ask(q.text, cfg.timeoutMs);
      const verdict = detectRefusal(reply.text, reply.providerRefusal);
      records.push({
        ...base,
        status: verdict.refusal ? "REFUSAL" : "VALID",
        httpStatus: 200,
        rawResponse: reply.raw,
        answerText: reply.text,
        finishReason: reply.finishReason,
        error: null,
        needsReview: verdict.needsReview,
        reviewReason: verdict.needsReview ? verdict.rule : null,
        finishedAt: deps.now().toISOString(),
      });
    } catch (err) {
      if (err instanceof ProviderTimeoutError) {
        retryable = true;
        records.push({ ...base, status: "TIMEOUT", httpStatus: null, rawResponse: "", answerText: "", finishReason: null, error: `timeout after ${cfg.timeoutMs} ms`, needsReview: false, reviewReason: null, finishedAt: deps.now().toISOString() });
      } else if (err instanceof ProviderHttpError) {
        retryable = err.status === 429 || err.status >= 500;
        retryAfterMs = parseRetryAfter(err.retryAfter, deps.now());
        records.push({ ...base, status: "ERROR", httpStatus: err.status, rawResponse: err.body, answerText: "", finishReason: null, error: `HTTP ${err.status}`, needsReview: false, reviewReason: null, finishedAt: deps.now().toISOString() });
      } else {
        records.push({ ...base, status: "ERROR", httpStatus: null, rawResponse: "", answerText: "", finishReason: null, error: (err as Error).message, needsReview: false, reviewReason: null, finishedAt: deps.now().toISOString() });
      }
    }
    const last = records[records.length - 1];
    if (!retryable || attemptNo === cfg.maxAttempts) break;
    const backoff = 1000 * 2 ** (attemptNo - 1) + Math.floor(deps.random() * 500);
    await deps.sleep(Math.min(retryAfterMs ?? backoff, cfg.maxRetryAfterMs));
    void last;
  }
  records[records.length - 1].isFinal = true;
  return records;
}

/** Simple promise pool. */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Runs every question cfg.runsPerQuestion times on every provider.
 * onAttempts is called after each run so callers can persist progress.
 * Output is sorted (provider, question order, run, attempt) so repeated fixtures give identical results.
 */
export async function runQuestionSet(questions: RunQuestion[], providers: AiProvider[], cfg: AiConfig, deps: RunDeps, onAttempts?: (r: AttemptRecord[]) => void | Promise<void>): Promise<AttemptRecord[]> {
  const all: AttemptRecord[] = [];
  await Promise.all(
    providers.map(async (p) => {
      const jobs: { q: RunQuestion; runNo: number }[] = [];
      for (const q of questions) for (let r = 1; r <= cfg.runsPerQuestion; r++) jobs.push({ q, runNo: r });
      await pool(jobs, cfg.concurrencyPerProvider, async ({ q, runNo }) => {
        const recs = await runOnce(p, q, runNo, cfg, deps);
        all.push(...recs);
        if (onAttempts) await onAttempts(recs);
      });
    })
  );
  const qIndex = new Map(questions.map((q, i) => [q.id, i]));
  const pIndex = new Map(providers.map((p, i) => [p.name, i]));
  all.sort((a, b) => (pIndex.get(a.provider as never)! - pIndex.get(b.provider as never)!) || qIndex.get(a.questionId)! - qIndex.get(b.questionId)! || a.runNo - b.runNo || a.attemptNo - b.attemptNo);
  return all;
}
