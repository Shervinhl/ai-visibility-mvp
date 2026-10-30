import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FakeProvider } from "../src/ai/providers";
import { runOnce, runQuestionSet, RunDeps } from "../src/ai/runner";
import { detectRefusal } from "../src/ai/refusal";
import { labelAnswer, inDoubleLabelSample } from "../src/ai/labeler";
import { aggregateCells, aggregateOverall, FinalRun } from "../src/ai/aggregate";
import { wilson, proportion } from "../src/ai/stats";
import { comparisonProblem, BatchMeta, compareRuns } from "../src/retest/compare";
import { loadAiConfig } from "../src/config";
import { normalizeFactList, FactList } from "../src/facts/types";
import { flowjinFacts } from "./fixtures/flowjin/site";

const sleeps: number[] = [];
const deps: RunDeps = { sleep: async (ms) => void sleeps.push(ms), now: () => new Date("2026-10-25T12:00:00Z"), random: () => 0 };
const cfg = { ...loadAiConfig(), runsPerQuestion: 3, timeoutMs: 60000, maxAttempts: 3 };
const q = { id: "q1", text: "What is the best AI clipping tool?" };

describe("fake provider runs (C2)", () => {
  test("timeout on every attempt: 3 attempts, final TIMEOUT", async () => {
    const p = new FakeProvider("fake-t", "t", () => "timeout");
    const recs = await runOnce(p, q, 1, cfg, deps);
    assert.equal(recs.length, 3);
    assert.ok(recs.every((r) => r.status === "TIMEOUT"));
    assert.equal(recs.filter((r) => r.isFinal).length, 1);
  });
  test("429 then success: retried, Retry-After respected, raw response stored", async () => {
    sleeps.length = 0;
    const p = new FakeProvider("fake-r", "r", (_q, n) => (n === 1 ? { error: 429, retryAfter: "7" } : { text: "Flowjin is a great choice." }));
    const recs = await runOnce(p, q, 1, cfg, deps);
    assert.deepEqual(recs.map((r) => r.status), ["ERROR", "VALID"]);
    assert.equal(recs[0].httpStatus, 429);
    assert.equal(sleeps[0], 7000);
    assert.ok(recs[1].rawResponse.includes("Flowjin"));
    assert.equal(recs[1].settings.temperature, 0);
  });
  test("400 is not retried", async () => {
    const p = new FakeProvider("fake-e", "e", () => ({ error: 400 }));
    const recs = await runOnce(p, q, 1, cfg, deps);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].status, "ERROR");
  });
  test("500 is retried up to 3 attempts", async () => {
    const p = new FakeProvider("fake-5", "5", () => ({ error: 503 }));
    assert.equal((await runOnce(p, q, 1, cfg, deps)).length, 3);
  });
  test("refusal detected and not retried", async () => {
    const p = new FakeProvider("fake-x", "x", () => ({ text: "I'm sorry, but I can't help with that." }));
    const recs = await runOnce(p, q, 1, cfg, deps);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].status, "REFUSAL");
  });
  test("refusal rules: provider flag, short phrase, long answer flagged for review", () => {
    assert.equal(detectRefusal("anything", true).refusal, true);
    assert.equal(detectRefusal("", false).needsReview, true);
    const long = "I can't recommend a single tool, but here are options: " + "Opus Clip is popular. ".repeat(30);
    const v = detectRefusal(long, false);
    assert.equal(v.refusal, false);
    assert.equal(v.needsReview, true);
  });
  test("runQuestionSet: 3 runs per question per provider, sorted deterministically", async () => {
    const a = new FakeProvider("fake-a", "a", () => ({ text: "ok" }));
    const b = new FakeProvider("fake-b", "b", () => ({ text: "ok" }));
    const recs = await runQuestionSet([q, { id: "q2", text: "Another question?" }], [a, b], cfg, deps);
    assert.equal(recs.filter((r) => r.isFinal).length, 12);
    assert.deepEqual(recs.slice(0, 3).map((r) => [r.provider, r.questionId, r.runNo]), [["fake-a", "q1", 1], ["fake-a", "q1", 2], ["fake-a", "q1", 3]]);
  });
});

describe("labeling (C3)", () => {
  const facts: FactList = normalizeFactList({ ...flowjinFacts, businessName: "Flow", aliases: [], competitors: ["Opus Clip"] });
  test("word boundaries: 'Flow' does not match 'Flowers' or 'Flowjin'", () => {
    assert.equal(labelAnswer("Flowers and Flowjin and workflow tools.", facts).mentioned, "NOT_MENTIONED");
    assert.equal(labelAnswer("Try Flow, it is quick.", facts).mentioned, "MENTIONED");
  });
  test("aliases count as a mention", () => {
    assert.equal(labelAnswer("Many podcasters use Flowjin AI.", flowjinFacts).mentioned, "MENTIONED");
  });
  test("same-name organization near the mention is AMBIGUOUS and needs review", () => {
    const f = normalizeFactList({ ...facts, homonyms: [{ name: "Flow Plumbing", contextTerms: ["plumbing", "Ohio"] }] });
    const l = labelAnswer("Flow is a plumbing company in Ohio.", f);
    assert.equal(l.mentioned, "AMBIGUOUS");
    assert.equal(l.needsReview, true);
    assert.equal(l.recommended, null);
  });
  test("common-word name with no anchor nearby is AMBIGUOUS; with an anchor it is MENTIONED", () => {
    const f = normalizeFactList({ ...facts, nameIsCommonWord: true });
    assert.equal(labelAnswer("Go with the flow and relax.", f).mentioned, "AMBIGUOUS");
    assert.equal(labelAnswer("Flow is an AI video clipping tool like Opus Clip.", f).mentioned, "MENTIONED");
  });
  test("a plain shortlist position is NEUTRAL (not a recommendation); 'other options' with no endorsement is not", () => {
    const short = "Best tools:\n1. **Flowjin** - finds highlights.\n2. Opus Clip";
    assert.equal(labelAnswer(short, flowjinFacts).recommended, "NOT_RECOMMENDED");
    assert.equal(labelAnswer(short, flowjinFacts).dimensions.target.strength, "neutral");
    const other = "Opus Clip is the top pick.\n\nOther options:\n- Flowjin\n- Klap";
    const l = labelAnswer(other, flowjinFacts);
    assert.equal(l.mentioned, "MENTIONED");
    assert.equal(l.recommended, "NOT_RECOMMENDED");
  });
  test("explicit endorsement is RECOMMENDED even outside a list", () => {
    assert.equal(labelAnswer("For podcasters I'd recommend Flowjin.", flowjinFacts).recommended, "RECOMMENDED");
  });
  test("a mention with a warning is not a recommendation", () => {
    assert.equal(labelAnswer("1. **Flowjin** - good, but some users report limited export formats.", flowjinFacts).recommended, "NOT_RECOMMENDED");
  });
  test("accuracy: CORRECT, INCORRECT (needs review), UNVERIFIABLE (never INCORRECT)", () => {
    const f = normalizeFactList({ ...flowjinFacts, locations: ["Toronto, ON, Canada"], prices: [{ plan: "Creator", amount: 19, currency: "USD", period: "month" }] });
    assert.equal(labelAnswer("Flowjin, based in Toronto, costs $19 per month.", f).accuracy, "CORRECT");
    const wrong = labelAnswer("Flowjin is based in Austin and costs $49 per month.", f);
    assert.equal(wrong.accuracy, "INCORRECT");
    assert.equal(wrong.needsReview, true);
    assert.equal(labelAnswer("Flowjin costs $49 per month.", flowjinFacts).accuracy, "UNVERIFIABLE", "no prices in the fact list: never INCORRECT");
    assert.equal(labelAnswer("Flowjin is loved by many.", flowjinFacts).accuracy, "UNVERIFIABLE");
  });
  test("competitor mentions are counted per answer", () => {
    assert.deepEqual(labelAnswer("Opus Clip and Descript are popular.", flowjinFacts).competitorMentions, ["Opus Clip", "Descript"]);
  });
  test("double-label sample is about 20% and deterministic", () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (inDoubleLabelSample(`run-${i}`)) n++;
    assert.ok(n > 330 && n < 470, `sample ${n}`);
    assert.equal(inDoubleLabelSample("run-1"), inDoubleLabelSample("run-1"));
  });
});

function fr(over: Partial<FinalRun>): FinalRun {
  return { aiRunId: "x", batchId: "b", questionId: "q1", questionText: "Q?", questionType: "RECOMMEND", provider: "fake-a", model: "m", runNo: 1, status: "VALID", finishedAt: "2026-10-25T12:00:00Z", mention: "NOT_MENTIONED", recommend: "NOT_RECOMMENDED", accuracy: null, excerpt: null, answerText: null, error: null, matchedTerm: null, competitorMentions: [], labelSource: "auto", ...over };
}

describe("reporting (C4)", () => {
  test("REFUSAL and ERROR are excluded from the denominator; under 2 valid runs is NOT_ASSESSED", () => {
    const cells = aggregateCells(
      [fr({ runNo: 1, mention: "MENTIONED" }), fr({ runNo: 2, status: "REFUSAL", mention: null, recommend: null }), fr({ runNo: 3, status: "ERROR", mention: null, recommend: null }), fr({ questionId: "q2", runNo: 1 }), fr({ questionId: "q2", runNo: 2, mention: "MENTIONED" }), fr({ questionId: "q2", runNo: 3, status: "TIMEOUT", mention: null })],
      2
    );
    assert.equal(cells[0].status, "NOT_ASSESSED");
    assert.match(cells[0].reason ?? "", /Only 1 valid/);
    assert.equal(cells[1].status, "REPORTED");
    assert.equal(cells[1].mentioned?.text, "Mentioned in 1 of 2 valid runs");
  });
  test("pending human review is not counted as mentioned or not mentioned", () => {
    const cells = aggregateCells([fr({ runNo: 1, mention: "PENDING_REVIEW", recommend: "PENDING_REVIEW" }), fr({ runNo: 2, mention: "MENTIONED" }), fr({ runNo: 3 })], 2);
    assert.equal(cells[0].mentioned?.of, 2);
    assert.equal(cells[0].mentioned?.pendingReview, 1);
  });
  test("Wilson 95% interval, and counts only under 10 answers", () => {
    const w = wilson(14, 30);
    assert.ok(Math.abs(w.low - 0.3023) < 0.0005 && Math.abs(w.high - 0.6386) < 0.0005, JSON.stringify(w));
    assert.equal(proportion(3, 9, 10).wilson95, null);
    assert.match(proportion(3, 9, 10).note ?? "", /too small/);
    const runs = [1, 2, 3].map((n) => fr({ runNo: n, mention: n === 1 ? "MENTIONED" : "NOT_MENTIONED" }));
    const o = aggregateOverall(runs, aggregateCells(runs, 2), "all", 10);
    assert.equal(o.mentioned.wilson95, null);
    assert.equal(o.mentioned.text, "mentioned in 1 of 3 valid answers");
  });
});

describe("re-test (D)", () => {
  const meta = (id: string, over: Partial<BatchMeta> = {}): BatchMeta => ({ id, questionSetId: "s1", questionSetVersion: "qs-v1", questionSetStatus: "FROZEN", providerSettings: { "fake-a": { model: "m", temperature: 0 } }, status: "DONE", finishedAt: "x", ...over });
  test("blocks comparisons across question-set versions", () => {
    assert.match(comparisonProblem([meta("a")], [meta("b", { questionSetId: "s2", questionSetVersion: "qs-v2" })]) ?? "", /different question sets/);
  });
  test("blocks comparisons with different provider settings", () => {
    assert.match(comparisonProblem([meta("a")], [meta("b", { providerSettings: { "fake-a": { model: "m", temperature: 0.7 } } })]) ?? "", /different providers or provider settings/);
  });
  test("allows same version and settings (key order does not matter)", () => {
    assert.equal(comparisonProblem([meta("a")], [meta("b", { providerSettings: { "fake-a": { temperature: 0, model: "m" } } })]), null);
  });
  test("uses the required wording and never claims cause", () => {
    const before = [1, 2, 3].map((n) => fr({ runNo: n, mention: n === 1 ? "MENTIONED" : "NOT_MENTIONED" }));
    const after = [1, 2, 3].map((n) => fr({ runNo: n, mention: "MENTIONED" }));
    const c = compareRuns(before, after, { questionSetVersion: "qs-v1", changeDescription: "added prices", changedAt: "2026-10-20", minValidRuns: 2, minForComparison: 10 });
    assert.equal(c.overall.statement, "After the change, the business was mentioned in 3 of 3 valid answers (before: 1 of 3). This is an observed sample, not proof that the change caused it.");
  });
});
