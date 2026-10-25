import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, flowjinPipeline, stripVolatile, TestServer, REVIEWER } from "./helpers/pipeline";
import { findForbiddenKeys } from "../src/api/report";
import { findBannedPhrase } from "../src/wording/catalog";
import { FakeProvider } from "../src/ai/providers";
import { alphaScript } from "./helpers/fakeAi";

const ALLOWED_STATUS = new Set(["PASS", "FAIL", "NOT_ASSESSED", "NOT_APPLICABLE"]);

describe("API end to end on the Flowjin fixture", () => {
  let s: TestServer;
  let p: Awaited<ReturnType<typeof flowjinPipeline>>;
  before(async () => {
    s = await startServer();
    p = await flowjinPipeline(s);
  });
  after(async () => s.close());

  test("check run returns a run id and an estimated time", () => {
    assert.ok(p.checkStart.runId);
    assert.ok(p.checkStart.estimatedSeconds > 0);
    assert.equal(p.checks.run.status, "DONE");
    assert.equal(p.checks.results.length, 12);
    for (const r of p.checks.results) assert.ok(ALLOWED_STATUS.has(r.status));
  });

  test("question set generated (30-40 candidates), approved and frozen as qs-v1", () => {
    const n = p.generation.questionSet.questions.length;
    assert.ok(n >= 30 && n <= 40, `${n}`);
    assert.equal(p.frozen.questionSet.version, "qs-v1");
    assert.equal(p.frozen.questionSet.frozenBy, REVIEWER);
  });

  test("AI run used two providers, 3 runs each", () => {
    assert.equal(p.aiRunStart.providers.length, 2);
    assert.equal(p.aiRunStart.plannedRuns, p.aiRunStart.questions * 2 * 3);
    assert.equal(p.runs.runs[0].status, "DONE");
  });

  test("report has no score field anywhere and no banned wording", () => {
    assert.deepEqual(findForbiddenKeys(p.report), []);
    assert.equal(findBannedPhrase(JSON.stringify(p.report)), null);
  });

  test("report shows a timeout question as NOT_ASSESSED with reason, and refusals are excluded", () => {
    const cells = p.report.ai.perQuestion as { status: string; reason: string | null; provider: string; refusals: number; timeouts: number }[];
    const na = cells.filter((c) => c.status === "NOT_ASSESSED");
    assert.ok(na.length >= 1);
    assert.ok(na.every((c) => c.reason && c.reason.length > 0));
    assert.ok(cells.some((c) => c.refusals > 0));
    const overall = p.report.ai.overall;
    assert.ok(overall.excludedRefusals >= 1);
    assert.ok(overall.validAnswers >= 10);
    assert.ok(overall.mentioned.wilson95, "Wilson interval present when 10+ answers");
  });

  test("freeze is refused below 20 approved questions", async () => {
    const gen = await s.call("POST", `/api/businesses/${p.businessId}/question-sets/generate`, {});
    const res = await s.call("POST", `/api/question-sets/${gen.body.questionSet.set.id}/freeze`, { reviewer: REVIEWER });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /at least 20/);
  });

  test("human label resolves a review item and is recorded with reviewer and rule version", async () => {
    const item = (p.runs.reviewQueue as { aiRunId: string; done: boolean }[]).find((i) => !i.done)!;
    assert.ok(item, "review queue has items (20% sample at least)");
    const bad = await s.call("POST", `/api/ai-runs/${item.aiRunId}/labels`, { mentioned: "AMBIGUOUS", labeledBy: REVIEWER });
    assert.equal(bad.status, 400);
    const ok = await s.call("POST", `/api/ai-runs/${item.aiRunId}/labels`, { mentioned: "MENTIONED", recommended: "RECOMMENDED", accuracy: "UNVERIFIABLE", labeledBy: REVIEWER });
    assert.equal(ok.status, 201);
    const runs = await s.call("GET", `/api/question-sets/${p.setId}/runs`);
    const after = (runs.body.reviewQueue as { aiRunId: string; done: boolean; humanLabels: { labeledBy: string }[] }[]).find((i) => i.aiRunId === item.aiRunId)!;
    assert.equal(after.done, true);
    assert.equal(after.humanLabels[0].labeledBy, REVIEWER);
  });

  test("versioning: editing a frozen set creates a new version; old results still point to qs-v1", async () => {
    const before = await s.call("GET", `/api/question-sets/${p.setId}`);
    const q = before.body.questions.find((x: { status: string }) => x.status === "APPROVED");
    const edit = await s.call("PATCH", `/api/question-sets/${p.setId}/questions/${q.id}`, { action: "edit", text: q.text + " (reworded)", reviewer: REVIEWER });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.createdNewSet, true);
    assert.notEqual(edit.body.questionSetId, p.setId);
    // old set unchanged
    const oldSet = await s.call("GET", `/api/question-sets/${p.setId}`);
    assert.equal(oldSet.body.set.version, "qs-v1");
    assert.equal(oldSet.body.questions.find((x: { id: string }) => x.id === q.id).text, q.text);
    // database refuses direct edits to frozen questions and to raw runs
    assert.throws(() => s.db.prepare("UPDATE question SET text = 'x' WHERE id = ?").run(q.id), /immutable/);
    assert.throws(() => s.db.prepare("UPDATE ai_run SET answer_text = 'x'").run(), /immutable/);
    // old AI results still link to the qs-v1 questions
    const linked = s.db.prepare("SELECT COUNT(*) AS n FROM ai_run r JOIN question q ON q.id = r.question_id WHERE r.batch_id = ? AND q.question_set_id = ?").get(p.aiRunId, p.setId) as { n: number };
    const all = s.db.prepare("SELECT COUNT(*) AS n FROM ai_run WHERE batch_id = ?").get(p.aiRunId) as { n: number };
    assert.equal(linked.n, all.n);
    // freezing the new set gives qs-v2
    const fz = await s.call("POST", `/api/question-sets/${edit.body.questionSetId}/freeze`, { reviewer: REVIEWER });
    assert.equal(fz.body.questionSet.version, "qs-v2");
    // a re-test across versions is blocked
    const run2 = await s.call("POST", `/api/question-sets/${edit.body.questionSetId}/runs`, {});
    await s.handle.idle();
    const blocked = await s.call("POST", "/api/change-events", { businessId: p.businessId, description: "x", changedAt: "2026-10-26", beforeRunIds: [p.aiRunId], afterRunIds: [run2.body.runId] });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /different question sets/);
  });

  test("re-test on the same version: side by side with the required wording", async () => {
    const again = await s.call("POST", `/api/question-sets/${p.setId}/runs`, {});
    await s.handle.idle();
    const ev = await s.call("POST", "/api/change-events", { businessId: p.businessId, description: "Fixed the about page canonical and added JSON-LD", changedAt: "2026-10-26T00:00:00Z", beforeRunIds: [p.aiRunId], afterRunIds: [again.body.runId], createdBy: REVIEWER });
    assert.equal(ev.status, 201);
    assert.match(ev.body.comparison.overall.statement, /^After the change, the business was mentioned in \d+ of \d+ valid answers \(before: \d+ of \d+\)\. This is an observed sample, not proof that the change caused it\.$/);
    const got = await s.call("GET", `/api/change-events/${ev.body.changeEvent.id}`);
    assert.equal(got.body.comparison.changeDescription, "Fixed the about page canonical and added JSON-LD");
  });

  test("AI runs need two providers", async () => {
    const one = await startServer({ providers: () => [new FakeProvider("fake-alpha", "alpha-1", alphaScript)] });
    try {
      const created = await one.call("POST", "/api/businesses", { facts: (await s.call("GET", `/api/businesses/${p.businessId}`)).body.factList.content, approvedBy: REVIEWER });
      const gen = await one.call("POST", `/api/businesses/${created.body.business.id}/question-sets/generate`, {});
      for (const q of gen.body.questionSet.questions) await one.call("PATCH", `/api/question-sets/${gen.body.questionSet.set.id}/questions/${q.id}`, { action: "approve", reviewer: REVIEWER });
      await one.call("POST", `/api/question-sets/${gen.body.questionSet.set.id}/freeze`, { reviewer: REVIEWER });
      const res = await one.call("POST", `/api/question-sets/${gen.body.questionSet.set.id}/runs`, {});
      assert.equal(res.status, 409);
      assert.match(res.body.error, /two of ANTHROPIC_API_KEY/);
    } finally {
      await one.close();
    }
  });

  test("fact list versions are immutable; PUT creates a new version", async () => {
    const cur = await s.call("GET", `/api/businesses/${p.businessId}`);
    const put = await s.call("PUT", `/api/businesses/${p.businessId}/fact-list`, { facts: { ...cur.body.factList.content, locations: ["Toronto, ON, Canada"] }, approvedBy: REVIEWER });
    assert.equal(put.body.factListVersion, 2);
    assert.throws(() => s.db.prepare("UPDATE fact_list SET content = '{}'").run(), /immutable/);
  });

  test("invalid input is rejected with a plain message", async () => {
    const res = await s.call("POST", "/api/businesses", { facts: { businessName: "" }, approvedBy: REVIEWER });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /businessName required/);
  });
});

describe("determinism", () => {
  test("running the same Flowjin fixture twice gives identical results", async () => {
    const a = await startServer();
    const b = await startServer();
    try {
      const ra = await flowjinPipeline(a);
      const rb = await flowjinPipeline(b);
      assert.deepEqual(stripVolatile(ra.checks.results), stripVolatile(rb.checks.results));
      assert.deepEqual(stripVolatile(ra.runs.perQuestion), stripVolatile(rb.runs.perQuestion));
      assert.deepEqual(stripVolatile(ra.report), stripVolatile(rb.report));
    } finally {
      await a.close();
      await b.close();
    }
  });
});
