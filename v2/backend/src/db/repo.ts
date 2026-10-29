import { randomUUID } from "crypto";
import { Db, tx } from "./db";
import { FactList } from "../facts/types";
import { CheckRunOutput } from "../checks/runner";
import { CHECK_IDS, CHECK_NAMES, CheckOutcome, CheckStatus } from "../checks/types";
import { findingFor, Finding } from "../wording/catalog";
import { CandidateQuestion, GenerationOutput, mixReport, QuestionType, QUESTION_TYPES } from "../questions/generate";
import { questionProblem } from "../questions/policy";
import { draftStatus, freezeProblem, QuestionSetStatus, QuestionStatus, versionLabel } from "../questions/rules";
import { AttemptRecord } from "../ai/runner";
import { AccuracyLabel, AutoLabel, inDoubleLabelSample, labelAnswer, LABEL_RULES_VERSION, MentionLabel, RecommendLabel } from "../ai/labeler";
import { EffAccuracy, EffMention, EffRecommend, FinalRun } from "../ai/aggregate";
import { BatchMeta, comparisonProblem } from "../retest/compare";

/** Thrown for problems the API should report as 4xx with a plain message. */
export class UserError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "UserError";
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => Number(v);

export interface Clock {
  now: () => Date;
  id: () => string;
}
export const realClock: Clock = { now: () => new Date(), id: () => randomUUID() };

// ---------------------------------------------------------------------------
// Business and fact list
// ---------------------------------------------------------------------------
export interface BusinessRow {
  id: string;
  name: string;
  createdAt: string;
  currentFactListVersion: number;
}

function toBusiness(r: Row): BusinessRow {
  return { id: str(r.id), name: str(r.name), createdAt: str(r.created_at), currentFactListVersion: num(r.current_fact_list_version) };
}

export function createBusiness(db: Db, facts: FactList, approvedBy: string, clock: Clock): { business: BusinessRow; factListVersion: number } {
  const id = clock.id();
  const at = clock.now().toISOString();
  tx(db, () => {
    db.prepare("INSERT INTO business (id, name, created_at, current_fact_list_version) VALUES (?, ?, ?, 1)").run(id, facts.businessName, at);
    db.prepare("INSERT INTO fact_list (id, business_id, version, content, approved_by, approved_at) VALUES (?, ?, 1, ?, ?, ?)").run(clock.id(), id, JSON.stringify(facts), approvedBy, at);
  });
  return { business: getBusiness(db, id), factListVersion: 1 };
}

export function addFactListVersion(db: Db, businessId: string, facts: FactList, approvedBy: string, clock: Clock): number {
  const b = getBusiness(db, businessId);
  const next = b.currentFactListVersion + 1;
  tx(db, () => {
    db.prepare("INSERT INTO fact_list (id, business_id, version, content, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?)").run(clock.id(), businessId, next, JSON.stringify(facts), approvedBy, clock.now().toISOString());
    db.prepare("UPDATE business SET current_fact_list_version = ?, name = ? WHERE id = ?").run(next, facts.businessName, businessId);
  });
  return next;
}

export function getBusiness(db: Db, id: string): BusinessRow {
  const r = db.prepare("SELECT * FROM business WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new UserError(404, `Business ${id} not found.`);
  return toBusiness(r);
}

export function listBusinesses(db: Db): BusinessRow[] {
  return (db.prepare("SELECT * FROM business ORDER BY created_at DESC").all() as Row[]).map(toBusiness);
}

export interface FactListRow {
  version: number;
  content: FactList;
  approvedBy: string;
  approvedAt: string;
}

export function getFactList(db: Db, businessId: string, version?: number): FactListRow {
  const v = version ?? getBusiness(db, businessId).currentFactListVersion;
  const r = db.prepare("SELECT * FROM fact_list WHERE business_id = ? AND version = ?").get(businessId, v) as Row | undefined;
  if (!r) throw new UserError(404, `Fact list version ${v} not found for business ${businessId}.`);
  return { version: num(r.version), content: JSON.parse(str(r.content)) as FactList, approvedBy: str(r.approved_by), approvedAt: str(r.approved_at) };
}

export function listFactListVersions(db: Db, businessId: string): { version: number; approvedBy: string; approvedAt: string }[] {
  return (db.prepare("SELECT version, approved_by, approved_at FROM fact_list WHERE business_id = ? ORDER BY version").all(businessId) as Row[]).map((r) => ({ version: num(r.version), approvedBy: str(r.approved_by), approvedAt: str(r.approved_at) }));
}

// ---------------------------------------------------------------------------
// Technical check runs
// ---------------------------------------------------------------------------
export interface CheckRunRow {
  id: string;
  businessId: string;
  factListVersion: number;
  startedAt: string;
  finishedAt: string | null;
  checkVersion: string;
  status: "RUNNING" | "DONE" | "ERROR";
  meta: Record<string, unknown> | null;
  error: string | null;
}

function toCheckRun(r: Row): CheckRunRow {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    factListVersion: num(r.fact_list_version),
    startedAt: str(r.started_at),
    finishedAt: strOrNull(r.finished_at),
    checkVersion: str(r.check_version),
    status: str(r.status) as CheckRunRow["status"],
    meta: r.meta ? (JSON.parse(str(r.meta)) as Record<string, unknown>) : null,
    error: strOrNull(r.error),
  };
}

export function createCheckRun(db: Db, businessId: string, factListVersion: number, checkVersion: string, config: unknown, clock: Clock): string {
  const id = clock.id();
  db.prepare("INSERT INTO site_check_run (id, business_id, fact_list_version, started_at, check_version, status, config) VALUES (?, ?, ?, ?, ?, 'RUNNING', ?)").run(id, businessId, factListVersion, clock.now().toISOString(), checkVersion, JSON.stringify(config));
  return id;
}

export function saveCheckRunOutput(db: Db, runId: string, out: CheckRunOutput, clock: Clock): void {
  tx(db, () => {
    const ins = db.prepare("INSERT INTO check_result (id, run_id, check_id, page_url, status, reason, evidence, next_step, check_version, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    let pos = 0;
    for (const o of out.outcomes) {
      ins.run(clock.id(), runId, o.checkId, null, o.status, o.reason, JSON.stringify(o.evidence), o.nextStep, out.checkVersion, pos++);
      for (const p of o.pages) ins.run(clock.id(), runId, o.checkId, p.pageUrl, p.status, p.reason, JSON.stringify(p.evidence), p.nextStep, out.checkVersion, pos++);
    }
    const meta = { homepage: out.homepage, keyPages: out.keyPages, keyPageSource: out.keyPageSource, requestsUsed: out.requestsUsed, requestCap: out.requestCap, notes: out.budgetNotes, requestLog: out.requestLog, runStartedAt: out.startedAt, runFinishedAt: out.finishedAt };
    db.prepare("UPDATE site_check_run SET status = 'DONE', finished_at = ?, meta = ? WHERE id = ?").run(clock.now().toISOString(), JSON.stringify(meta), runId);
  });
}

export function failCheckRun(db: Db, runId: string, error: string, clock: Clock): void {
  db.prepare("UPDATE site_check_run SET status = 'ERROR', finished_at = ?, error = ? WHERE id = ?").run(clock.now().toISOString(), error, runId);
}

export interface CheckResultView {
  checkId: string;
  name: string;
  status: CheckStatus;
  reason: string;
  nextStep: string | null;
  evidence: unknown;
  checkVersion: string;
  finding: Finding;
  pages: { pageUrl: string; status: CheckStatus; reason: string; nextStep: string | null; evidence: unknown }[];
}

export function getCheckRun(db: Db, runId: string): { run: CheckRunRow; results: CheckResultView[] } {
  const r = db.prepare("SELECT * FROM site_check_run WHERE id = ?").get(runId) as Row | undefined;
  if (!r) throw new UserError(404, `Check run ${runId} not found.`);
  const run = toCheckRun(r);
  const rows = db.prepare("SELECT * FROM check_result WHERE run_id = ? ORDER BY position").all(runId) as Row[];
  const results: CheckResultView[] = [];
  for (const id of CHECK_IDS) {
    const site = rows.find((x) => x.check_id === id && x.page_url === null);
    if (!site) continue;
    const outcome: CheckOutcome = {
      checkId: id,
      name: "",
      status: str(site.status) as CheckStatus,
      reason: str(site.reason),
      nextStep: strOrNull(site.next_step),
      evidence: JSON.parse(str(site.evidence)),
      pages: [],
    };
    outcome.name = CHECK_NAMES[id];
    results.push({
      checkId: id,
      name: outcome.name,
      status: outcome.status,
      reason: outcome.reason,
      nextStep: outcome.nextStep,
      evidence: outcome.evidence,
      checkVersion: str(site.check_version),
      finding: findingFor(outcome),
      pages: rows
        .filter((x) => x.check_id === id && x.page_url !== null)
        .map((x) => ({ pageUrl: str(x.page_url), status: str(x.status) as CheckStatus, reason: str(x.reason), nextStep: strOrNull(x.next_step), evidence: JSON.parse(str(x.evidence)) })),
    });
  }
  return { run, results };
}

export function latestCheckRunId(db: Db, businessId: string): string | null {
  const r = db.prepare("SELECT id FROM site_check_run WHERE business_id = ? AND status = 'DONE' ORDER BY started_at DESC LIMIT 1").get(businessId) as Row | undefined;
  return r ? str(r.id) : null;
}

export function listCheckRuns(db: Db, businessId: string): CheckRunRow[] {
  return (db.prepare("SELECT * FROM site_check_run WHERE business_id = ? ORDER BY started_at DESC").all(businessId) as Row[]).map(toCheckRun);
}

// ---------------------------------------------------------------------------
// Question sets
// ---------------------------------------------------------------------------
export interface QuestionRow {
  id: string;
  questionSetId: string;
  position: number;
  text: string;
  type: QuestionType;
  source: string;
  status: QuestionStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  editedBy: string | null;
  editedAt: string | null;
  originalText: string;
  copiedFromQuestionId: string | null;
}

export interface QuestionSetRow {
  id: string;
  businessId: string;
  version: string | null;
  versionNo: number | null;
  status: QuestionSetStatus;
  createdAt: string;
  frozenAt: string | null;
  frozenBy: string | null;
  parentSetId: string | null;
  factListVersion: number;
  generation: unknown;
}

function toQuestion(r: Row): QuestionRow {
  return {
    id: str(r.id),
    questionSetId: str(r.question_set_id),
    position: num(r.position),
    text: str(r.text),
    type: str(r.type) as QuestionType,
    source: str(r.source),
    status: str(r.status) as QuestionStatus,
    approvedBy: strOrNull(r.approved_by),
    approvedAt: strOrNull(r.approved_at),
    editedBy: strOrNull(r.edited_by),
    editedAt: strOrNull(r.edited_at),
    originalText: str(r.original_text),
    copiedFromQuestionId: strOrNull(r.copied_from_question_id),
  };
}

function toSet(r: Row): QuestionSetRow {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    version: strOrNull(r.version),
    versionNo: r.version_no === null || r.version_no === undefined ? null : num(r.version_no),
    status: str(r.status) as QuestionSetStatus,
    createdAt: str(r.created_at),
    frozenAt: strOrNull(r.frozen_at),
    frozenBy: strOrNull(r.frozen_by),
    parentSetId: strOrNull(r.parent_set_id),
    factListVersion: num(r.fact_list_version),
    generation: r.generation ? JSON.parse(str(r.generation)) : null,
  };
}

export function createQuestionSet(db: Db, businessId: string, factListVersion: number, gen: GenerationOutput | null, candidates: CandidateQuestion[], clock: Clock): string {
  const id = clock.id();
  tx(db, () => {
    db.prepare("INSERT INTO question_set (id, business_id, status, created_at, fact_list_version, generation) VALUES (?, ?, 'CANDIDATE', ?, ?, ?)").run(id, businessId, clock.now().toISOString(), factListVersion, gen ? JSON.stringify(gen) : null);
    const ins = db.prepare("INSERT INTO question (id, question_set_id, position, text, type, source, status, original_text) VALUES (?, ?, ?, ?, ?, ?, 'CANDIDATE', ?)");
    candidates.forEach((c, i) => ins.run(clock.id(), id, i + 1, c.text, c.type, c.source, c.text));
  });
  return id;
}

export function getQuestionSet(db: Db, id: string): { set: QuestionSetRow; questions: QuestionRow[]; counts: Record<QuestionStatus, number>; approvedMix: ReturnType<typeof mixReport> } {
  const r = db.prepare("SELECT * FROM question_set WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new UserError(404, `Question set ${id} not found.`);
  const questions = (db.prepare("SELECT * FROM question WHERE question_set_id = ? ORDER BY position").all(id) as Row[]).map(toQuestion);
  const counts = { CANDIDATE: 0, APPROVED: 0, REMOVED: 0 } as Record<QuestionStatus, number>;
  for (const q of questions) counts[q.status] += 1;
  return { set: toSet(r), questions, counts, approvedMix: mixReport(questions.filter((q) => q.status === "APPROVED")) };
}

export function listQuestionSets(db: Db, businessId: string): QuestionSetRow[] {
  return (db.prepare("SELECT * FROM question_set WHERE business_id = ? ORDER BY created_at DESC").all(businessId) as Row[]).map(toSet);
}

function refreshDraftStatus(db: Db, setId: string): void {
  const { set, counts } = getQuestionSet(db, setId);
  if (set.status === "FROZEN") return;
  const next = draftStatus({ candidate: counts.CANDIDATE, approved: counts.APPROVED });
  if (next !== set.status) db.prepare("UPDATE question_set SET status = ? WHERE id = ?").run(next, setId);
}

/** Copies a frozen set's approved questions into a new draft set. Old runs stay linked to the old questions. */
function cloneFrozenSet(db: Db, setId: string, clock: Clock): { newSetId: string; idMap: Map<string, string> } {
  const { set, questions } = getQuestionSet(db, setId);
  const newSetId = clock.id();
  const idMap = new Map<string, string>();
  db.prepare("INSERT INTO question_set (id, business_id, status, created_at, parent_set_id, fact_list_version, generation) VALUES (?, ?, 'CANDIDATE', ?, ?, ?, ?)").run(
    newSetId,
    set.businessId,
    clock.now().toISOString(),
    set.id,
    set.factListVersion,
    JSON.stringify({ copiedFrom: set.version, note: `Created because a change was requested on frozen set ${set.version}.` })
  );
  const ins = db.prepare("INSERT INTO question (id, question_set_id, position, text, type, source, status, approved_by, approved_at, edited_by, edited_at, original_text, copied_from_question_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let pos = 1;
  for (const q of questions.filter((x) => x.status === "APPROVED")) {
    const nid = clock.id();
    idMap.set(q.id, nid);
    ins.run(nid, newSetId, pos++, q.text, q.type, q.source, "APPROVED", q.approvedBy, q.approvedAt, q.editedBy, q.editedAt, q.originalText, q.id);
  }
  return { newSetId, idMap };
}

export type QuestionPatch = { action: "approve" } | { action: "remove" } | { action: "edit"; text?: string; type?: QuestionType };

/**
 * Applies a reviewer action. On a FROZEN set the change is applied to a new draft set (next version on freeze);
 * the frozen set is untouched.
 */
export function patchQuestion(db: Db, setId: string, questionId: string, patch: QuestionPatch, reviewer: string, clock: Clock): { questionSetId: string; questionId: string; createdNewSet: boolean } {
  if (patch.action === "edit" && patch.text !== undefined) enforceQuestionPolicy(db, setId, patch.text);
  return tx(db, () => {
    const { set, questions } = getQuestionSet(db, setId);
    let targetSet = setId;
    let targetQ = questionId;
    let created = false;
    if (!questions.some((q) => q.id === questionId)) throw new UserError(404, `Question ${questionId} is not in set ${setId}.`);
    if (set.status === "FROZEN") {
      const { newSetId, idMap } = cloneFrozenSet(db, setId, clock);
      const mapped = idMap.get(questionId);
      if (!mapped) throw new UserError(409, "Only approved questions are copied from a frozen set; this question was not approved in it.");
      targetSet = newSetId;
      targetQ = mapped;
      created = true;
    }
    const at = clock.now().toISOString();
    if (patch.action === "approve") {
      db.prepare("UPDATE question SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?").run(reviewer, at, targetQ);
    } else if (patch.action === "remove") {
      db.prepare("UPDATE question SET status = 'REMOVED', approved_by = NULL, approved_at = NULL, edited_by = ?, edited_at = ? WHERE id = ?").run(reviewer, at, targetQ);
    } else {
      if (patch.type !== undefined && !QUESTION_TYPES.includes(patch.type)) throw new UserError(400, `type must be one of ${QUESTION_TYPES.join(", ")}`);
      const cur = getQuestionSet(db, targetSet).questions.find((q) => q.id === targetQ)!;
      const text = patch.text?.trim() || cur.text;
      // The reviewer who edits a question approves the edited wording; the original text is kept in original_text.
      db.prepare("UPDATE question SET text = ?, type = ?, edited_by = ?, edited_at = ?, status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?").run(text, patch.type ?? cur.type, reviewer, at, reviewer, at, targetQ);
    }
    refreshDraftStatus(db, targetSet);
    return { questionSetId: targetSet, questionId: targetQ, createdNewSet: created };
  });
}

/** Question policy (no how-to questions, no company names). Throws a 400 with the reason. */
export function enforceQuestionPolicy(db: Db, setId: string, text: string): void {
  const row = db.prepare("SELECT business_id FROM question_set WHERE id = ?").get(setId) as Row | undefined;
  if (!row) return;
  const problem = questionProblem(text, getFactList(db, str(row.business_id)).content);
  if (problem) throw new UserError(400, `This question cannot be used: ${problem}.`);
}

export function addQuestion(db: Db, setId: string, text: string, type: QuestionType, reviewer: string, clock: Clock): { questionSetId: string; questionId: string; createdNewSet: boolean } {
  if (!QUESTION_TYPES.includes(type)) throw new UserError(400, `type must be one of ${QUESTION_TYPES.join(", ")}`);
  if (!text.trim()) throw new UserError(400, "text is required");
  enforceQuestionPolicy(db, setId, text);
  return tx(db, () => {
    const { set } = getQuestionSet(db, setId);
    let target = setId;
    let created = false;
    if (set.status === "FROZEN") {
      target = cloneFrozenSet(db, setId, clock).newSetId;
      created = true;
    }
    const max = db.prepare("SELECT COALESCE(MAX(position), 0) AS m FROM question WHERE question_set_id = ?").get(target) as Row;
    const id = clock.id();
    const at = clock.now().toISOString();
    db.prepare("INSERT INTO question (id, question_set_id, position, text, type, source, status, approved_by, approved_at, original_text) VALUES (?, ?, ?, ?, ?, 'REVIEWER', 'APPROVED', ?, ?, ?)").run(id, target, num(max.m) + 1, text.trim(), type, reviewer, at, text.trim());
    refreshDraftStatus(db, target);
    return { questionSetId: target, questionId: id, createdNewSet: created };
  });
}

export function freezeQuestionSet(db: Db, setId: string, reviewer: string, clock: Clock): QuestionSetRow {
  return tx(db, () => {
    const { set, counts } = getQuestionSet(db, setId);
    const problem = freezeProblem(counts.APPROVED, set.status);
    if (problem) throw new UserError(409, problem);
    const r = db.prepare("SELECT COALESCE(MAX(version_no), 0) AS m FROM question_set WHERE business_id = ?").get(set.businessId) as Row;
    const n = num(r.m) + 1;
    db.prepare("UPDATE question_set SET status = 'FROZEN', version = ?, version_no = ?, frozen_at = ?, frozen_by = ? WHERE id = ?").run(versionLabel(n), n, clock.now().toISOString(), reviewer, setId);
    return getQuestionSet(db, setId).set;
  });
}

// ---------------------------------------------------------------------------
// AI runs and labels
// ---------------------------------------------------------------------------
export interface BatchRow {
  id: string;
  questionSetId: string;
  factListVersion: number;
  providers: string[];
  settings: Record<string, unknown>;
  runsPerQuestion: number;
  status: "RUNNING" | "DONE" | "ERROR";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

function toBatch(r: Row): BatchRow {
  return {
    id: str(r.id),
    questionSetId: str(r.question_set_id),
    factListVersion: num(r.fact_list_version),
    providers: JSON.parse(str(r.providers)) as string[],
    settings: JSON.parse(str(r.settings)) as Record<string, unknown>,
    runsPerQuestion: num(r.runs_per_question),
    status: str(r.status) as BatchRow["status"],
    startedAt: str(r.started_at),
    finishedAt: strOrNull(r.finished_at),
    error: strOrNull(r.error),
  };
}

export function createBatch(db: Db, setId: string, providerSettings: Record<string, unknown>, runsPerQuestion: number, clock: Clock): { batchId: string; questions: QuestionRow[]; factListVersion: number } {
  const { set, questions } = getQuestionSet(db, setId);
  if (set.status !== "FROZEN") throw new UserError(409, "Freeze the question set before running it, so results stay linked to a fixed version.");
  const approved = questions.filter((q) => q.status === "APPROVED");
  const id = clock.id();
  db.prepare("INSERT INTO ai_run_batch (id, question_set_id, fact_list_version, providers, settings, runs_per_question, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?)").run(
    id,
    setId,
    set.factListVersion,
    JSON.stringify(Object.keys(providerSettings)),
    JSON.stringify(providerSettings),
    runsPerQuestion,
    clock.now().toISOString()
  );
  return { batchId: id, questions: approved, factListVersion: set.factListVersion };
}

/** Stores attempts (raw, immutable) and an automatic label for each final VALID attempt. */
export function saveAttempts(db: Db, batchId: string, records: AttemptRecord[], facts: FactList, clock: Clock): void {
  tx(db, () => {
    const ins = db.prepare(
      "INSERT INTO ai_run (id, batch_id, question_id, provider, model, settings, run_no, attempt_no, is_final, status, http_status, raw_response, answer_text, finish_reason, error, needs_review, review_reason, refusal_rules_version, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const r of records) {
      const id = clock.id();
      ins.run(id, batchId, r.questionId, r.provider, r.model, JSON.stringify(r.settings), r.runNo, r.attemptNo, r.isFinal ? 1 : 0, r.status, r.httpStatus, r.rawResponse, r.answerText, r.finishReason, r.error, r.needsReview ? 1 : 0, r.reviewReason, r.refusalRulesVersion, r.startedAt, r.finishedAt);
      if (r.isFinal && r.status === "VALID") insertAutoLabel(db, id, labelAnswer(r.answerText, facts), clock);
    }
  });
}

function insertAutoLabel(db: Db, aiRunId: string, l: AutoLabel, clock: Clock): void {
  db.prepare("INSERT INTO ai_label (id, ai_run_id, kind, mentioned, recommended, accuracy, rule_version, labeled_by, labeled_at, needs_review, details) VALUES (?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?, ?)").run(
    clock.id(),
    aiRunId,
    l.mentioned,
    l.recommended,
    l.accuracy,
    l.ruleVersion,
    `auto:${l.ruleVersion}`,
    clock.now().toISOString(),
    l.needsReview ? 1 : 0,
    JSON.stringify({ matchedTerm: l.matchedTerm, excerpt: l.excerpt, claims: l.claims, recommendationEvidence: l.recommendationEvidence, competitorMentions: l.competitorMentions, reviewReasons: l.reviewReasons })
  );
}

export function finishBatch(db: Db, batchId: string, status: "DONE" | "ERROR", error: string | null, clock: Clock): void {
  db.prepare("UPDATE ai_run_batch SET status = ?, finished_at = ?, error = ? WHERE id = ?").run(status, clock.now().toISOString(), error, batchId);
}

export function getBatch(db: Db, batchId: string): BatchRow {
  const r = db.prepare("SELECT * FROM ai_run_batch WHERE id = ?").get(batchId) as Row | undefined;
  if (!r) throw new UserError(404, `AI run ${batchId} not found.`);
  return toBatch(r);
}

export function listBatches(db: Db, setId: string): BatchRow[] {
  return (db.prepare("SELECT * FROM ai_run_batch WHERE question_set_id = ? ORDER BY started_at DESC").all(setId) as Row[]).map(toBatch);
}

export function listBatchesForBusiness(db: Db, businessId: string): BatchRow[] {
  return (db.prepare("SELECT b.* FROM ai_run_batch b JOIN question_set s ON s.id = b.question_set_id WHERE s.business_id = ? ORDER BY b.started_at DESC").all(businessId) as Row[]).map(toBatch);
}

export function batchProgress(db: Db, batchId: string): { finalRuns: number; attempts: number } {
  const r = db.prepare("SELECT SUM(is_final) AS f, COUNT(*) AS a FROM ai_run WHERE batch_id = ?").get(batchId) as Row;
  return { finalRuns: num(r.f ?? 0), attempts: num(r.a ?? 0) };
}

interface LabelRow {
  kind: "auto" | "human";
  mentioned: MentionLabel;
  recommended: RecommendLabel | null;
  accuracy: AccuracyLabel | null;
  ruleVersion: string;
  labeledBy: string;
  labeledAt: string;
  needsReview: boolean;
  details: Record<string, unknown>;
  note: string | null;
}

function labelsFor(db: Db, aiRunId: string): LabelRow[] {
  return (db.prepare("SELECT * FROM ai_label WHERE ai_run_id = ? ORDER BY labeled_at, rowid").all(aiRunId) as Row[]).map((r) => ({
    kind: str(r.kind) as "auto" | "human",
    mentioned: str(r.mentioned) as MentionLabel,
    recommended: strOrNull(r.recommended) as RecommendLabel | null,
    accuracy: strOrNull(r.accuracy) as AccuracyLabel | null,
    ruleVersion: str(r.rule_version),
    labeledBy: str(r.labeled_by),
    labeledAt: str(r.labeled_at),
    needsReview: num(r.needs_review) === 1,
    details: JSON.parse(str(r.details)) as Record<string, unknown>,
    note: strOrNull(r.note),
  }));
}

/** Effective label: latest human label, else the automatic label with AMBIGUOUS/INCORRECT held as PENDING_REVIEW. */
export function effectiveLabel(labels: LabelRow[]): { mention: EffMention; recommend: EffRecommend; accuracy: EffAccuracy; source: "human" | "auto" } | null {
  const human = labels.filter((l) => l.kind === "human").slice(-1)[0];
  if (human) {
    return {
      mention: human.mentioned as EffMention,
      recommend: human.mentioned === "MENTIONED" ? (human.recommended ?? "NOT_RECOMMENDED") : "NOT_RECOMMENDED",
      accuracy: human.mentioned === "MENTIONED" ? human.accuracy : null,
      source: "human",
    };
  }
  const auto = labels.find((l) => l.kind === "auto");
  if (!auto) return null;
  if (auto.mentioned === "AMBIGUOUS") return { mention: "PENDING_REVIEW", recommend: "PENDING_REVIEW", accuracy: "PENDING_REVIEW", source: "auto" };
  return { mention: auto.mentioned, recommend: auto.recommended ?? "NOT_RECOMMENDED", accuracy: auto.accuracy === "INCORRECT" ? "PENDING_REVIEW" : auto.accuracy, source: "auto" };
}

export function finalRuns(db: Db, batchIds: string[]): FinalRun[] {
  if (!batchIds.length) return [];
  const rows = db
    .prepare(
      `SELECT r.*, q.text AS q_text, q.type AS q_type, q.position AS q_pos FROM ai_run r JOIN question q ON q.id = r.question_id
       WHERE r.is_final = 1 AND r.batch_id IN (${batchIds.map(() => "?").join(",")}) ORDER BY r.provider, q.position, r.run_no`
    )
    .all(...batchIds) as Row[];
  return rows.map((r) => {
    const labels = labelsFor(db, str(r.id));
    const eff = str(r.status) === "VALID" ? effectiveLabel(labels) : null;
    const auto = labels.find((l) => l.kind === "auto");
    return {
      aiRunId: str(r.id),
      batchId: str(r.batch_id),
      questionId: str(r.question_id),
      questionText: str(r.q_text),
      questionType: str(r.q_type),
      provider: str(r.provider),
      model: str(r.model),
      runNo: num(r.run_no),
      status: str(r.status) as FinalRun["status"],
      finishedAt: str(r.finished_at),
      mention: eff?.mention ?? null,
      recommend: eff?.recommend ?? null,
      accuracy: eff?.accuracy ?? null,
      excerpt: auto ? (strOrNull(auto.details.excerpt) ?? null) : null,
      answerText: str(r.status) === "VALID" ? str(r.answer_text) : null,
      error: strOrNull(r.error) ?? null,
      competitorMentions: auto ? ((auto.details.competitorMentions as string[]) ?? []) : [],
      labelSource: eff?.source ?? null,
    };
  });
}

export interface HumanLabelInput {
  mentioned: "MENTIONED" | "NOT_MENTIONED";
  recommended?: "RECOMMENDED" | "NOT_RECOMMENDED";
  accuracy?: "CORRECT" | "INCORRECT" | "UNVERIFIABLE";
  labeledBy: string;
  note?: string;
}

export function addHumanLabel(db: Db, aiRunId: string, input: HumanLabelInput, clock: Clock): void {
  const run = db.prepare("SELECT status, is_final FROM ai_run WHERE id = ?").get(aiRunId) as Row | undefined;
  if (!run) throw new UserError(404, `AI run ${aiRunId} not found.`);
  if (str(run.status) !== "VALID" || num(run.is_final) !== 1) throw new UserError(409, "Only final VALID answers are labeled. Refusals, errors and timeouts are reported separately.");
  if (input.mentioned !== "MENTIONED" && input.mentioned !== "NOT_MENTIONED") throw new UserError(400, "mentioned must be MENTIONED or NOT_MENTIONED (a human decision resolves AMBIGUOUS).");
  if (input.mentioned === "MENTIONED" && !input.recommended) throw new UserError(400, "recommended (RECOMMENDED or NOT_RECOMMENDED) is required when mentioned.");
  if (input.mentioned === "MENTIONED" && !input.accuracy) throw new UserError(400, "accuracy (CORRECT, INCORRECT or UNVERIFIABLE) is required when mentioned.");
  if (!input.labeledBy || input.labeledBy.trim().length < 2) throw new UserError(400, "labeledBy (reviewer name) is required.");
  db.prepare("INSERT INTO ai_label (id, ai_run_id, kind, mentioned, recommended, accuracy, rule_version, labeled_by, labeled_at, needs_review, details, note) VALUES (?, ?, 'human', ?, ?, ?, ?, ?, ?, 0, '{}', ?)").run(
    clock.id(),
    aiRunId,
    input.mentioned,
    input.mentioned === "MENTIONED" ? input.recommended! : "NOT_RECOMMENDED",
    input.mentioned === "MENTIONED" ? input.accuracy! : null,
    LABEL_RULES_VERSION,
    input.labeledBy.trim(),
    clock.now().toISOString(),
    input.note ?? null
  );
}

export interface ReviewItem {
  aiRunId: string;
  batchId: string;
  provider: string;
  model: string;
  questionText: string;
  runNo: number;
  reasons: string[];
  answerText: string;
  autoLabel: { mentioned: string; recommended: string | null; accuracy: string | null; details: Record<string, unknown> } | null;
  humanLabels: { mentioned: string; recommended: string | null; accuracy: string | null; labeledBy: string; labeledAt: string; note: string | null }[];
  done: boolean;
}

/** Review queue: AMBIGUOUS, INCORRECT, unsure refusals, and the 20% double-label sample. */
export function reviewQueue(db: Db, batchIds: string[]): ReviewItem[] {
  if (!batchIds.length) return [];
  const rows = db
    .prepare(`SELECT r.*, q.text AS q_text, q.position AS q_pos FROM ai_run r JOIN question q ON q.id = r.question_id WHERE r.is_final = 1 AND r.batch_id IN (${batchIds.map(() => "?").join(",")}) ORDER BY r.provider, q.position, r.run_no`)
    .all(...batchIds) as Row[];
  const items: ReviewItem[] = [];
  for (const r of rows) {
    const id = str(r.id);
    const labels = labelsFor(db, id);
    const auto = labels.find((l) => l.kind === "auto") ?? null;
    const humans = labels.filter((l) => l.kind === "human");
    const reasons: string[] = [];
    if (auto?.mentioned === "AMBIGUOUS") reasons.push("AMBIGUOUS mention");
    if (auto?.accuracy === "INCORRECT") reasons.push("INCORRECT claim");
    if (num(r.needs_review) === 1) reasons.push(`attempt flagged: ${str(r.review_reason)}`);
    if (str(r.status) === "VALID" && inDoubleLabelSample(id)) reasons.push("double-label sample (20%)");
    if (!reasons.length) continue;
    items.push({
      aiRunId: id,
      batchId: str(r.batch_id),
      provider: str(r.provider),
      model: str(r.model),
      questionText: str(r.q_text),
      runNo: num(r.run_no),
      reasons,
      answerText: str(r.answer_text),
      autoLabel: auto ? { mentioned: auto.mentioned, recommended: auto.recommended, accuracy: auto.accuracy, details: auto.details } : null,
      humanLabels: humans.map((h) => ({ mentioned: h.mentioned, recommended: h.recommended, accuracy: h.accuracy, labeledBy: h.labeledBy, labeledAt: h.labeledAt, note: h.note })),
      done: humans.length > 0 || str(r.status) !== "VALID",
    });
  }
  return items;
}

/** Agreement between automatic and human labels on the double-label sample. */
export function labelAgreement(db: Db, batchIds: string[]): { sampled: number; humanLabeled: number; mentionAgreement: { agree: number; of: number }; recommendAgreement: { agree: number; of: number }; ruleVersion: string } {
  const items = reviewQueue(db, batchIds).filter((i) => i.reasons.includes("double-label sample (20%)"));
  const labeled = items.filter((i) => i.humanLabels.length && i.autoLabel && i.autoLabel.mentioned !== "AMBIGUOUS");
  const m = labeled.filter((i) => i.autoLabel!.mentioned === i.humanLabels[0].mentioned).length;
  const both = labeled.filter((i) => i.humanLabels[0].mentioned === "MENTIONED" && i.autoLabel!.mentioned === "MENTIONED");
  const rAgree = both.filter((i) => i.autoLabel!.recommended === i.humanLabels[0].recommended).length;
  return { sampled: items.length, humanLabeled: labeled.length, mentionAgreement: { agree: m, of: labeled.length }, recommendAgreement: { agree: rAgree, of: both.length }, ruleVersion: LABEL_RULES_VERSION };
}

// ---------------------------------------------------------------------------
// Change events (Part D)
// ---------------------------------------------------------------------------
export function batchMeta(db: Db, batchId: string): BatchMeta {
  const b = getBatch(db, batchId);
  const { set } = getQuestionSet(db, b.questionSetId);
  return { id: b.id, questionSetId: b.questionSetId, questionSetVersion: set.version, questionSetStatus: set.status, providerSettings: b.settings, status: b.status, finishedAt: b.finishedAt };
}

export interface ChangeEventRow {
  id: string;
  businessId: string;
  description: string;
  changedAt: string;
  beforeRunIds: string[];
  afterRunIds: string[];
  createdAt: string;
  createdBy: string | null;
}

export function createChangeEvent(db: Db, input: { businessId: string; description: string; changedAt: string; beforeRunIds: string[]; afterRunIds: string[]; createdBy?: string }, clock: Clock): ChangeEventRow {
  getBusiness(db, input.businessId);
  if (!input.description?.trim()) throw new UserError(400, "description (what was changed) is required.");
  if (Number.isNaN(Date.parse(input.changedAt))) throw new UserError(400, "changedAt must be a date (ISO 8601).");
  const metas = [...input.beforeRunIds, ...input.afterRunIds].map((id) => batchMeta(db, id));
  const problem = comparisonProblem(metas.slice(0, input.beforeRunIds.length), metas.slice(input.beforeRunIds.length));
  if (problem) throw new UserError(409, problem);
  const set = getQuestionSet(db, metas[0].questionSetId).set;
  if (set.businessId !== input.businessId) throw new UserError(409, "These runs belong to a different business.");
  const id = clock.id();
  db.prepare("INSERT INTO change_event (id, business_id, description, changed_at, before_run_ids, after_run_ids, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    input.businessId,
    input.description.trim(),
    new Date(input.changedAt).toISOString(),
    JSON.stringify(input.beforeRunIds),
    JSON.stringify(input.afterRunIds),
    clock.now().toISOString(),
    input.createdBy ?? null
  );
  return getChangeEvent(db, id);
}

export function getChangeEvent(db: Db, id: string): ChangeEventRow {
  const r = db.prepare("SELECT * FROM change_event WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new UserError(404, `Change event ${id} not found.`);
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    description: str(r.description),
    changedAt: str(r.changed_at),
    beforeRunIds: JSON.parse(str(r.before_run_ids)) as string[],
    afterRunIds: JSON.parse(str(r.after_run_ids)) as string[],
    createdAt: str(r.created_at),
    createdBy: strOrNull(r.created_by),
  };
}

export function listChangeEvents(db: Db, businessId: string): ChangeEventRow[] {
  return (db.prepare("SELECT id FROM change_event WHERE business_id = ? ORDER BY changed_at DESC").all(businessId) as Row[]).map((r) => getChangeEvent(db, str(r.id)));
}
