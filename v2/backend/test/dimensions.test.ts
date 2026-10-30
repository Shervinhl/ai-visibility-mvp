import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { labelAnswer } from "../src/ai/labeler";
import { evaluateBrands, intentCoverage, primaryIntent, requirementWords } from "../src/ai/dimensions";
import { aggregateDimensions, aggregateCells, FinalRun } from "../src/ai/aggregate";
import { flowjinFacts } from "./fixtures/flowjin/site";

const f = flowjinFacts;

describe("recommendation strength (dimensions-v1)", () => {
  test("explicit endorsement is strong", () => {
    const d = labelAnswer("I recommend Flowjin because it finds highlights fast.", f).dimensions.target;
    assert.equal(d.strength, "strong");
    assert.equal(labelAnswer("For podcasters, I recommend Flowjin.", f).dimensions.target.strength, "qualified");
    assert.equal(d.prominence, "high");
  });
  test("an endorsement with a condition is qualified", () => {
    const d = labelAnswer("I'd recommend Flowjin if you publish podcasts weekly.", f).dimensions.target;
    assert.equal(d.strength, "qualified");
    assert.equal(labelAnswer("I'd recommend Flowjin if you publish podcasts weekly.", f).recommended, "RECOMMENDED");
  });
  test("a warning makes the mention negative and low prominence", () => {
    const l = labelAnswer("Flowjin is fine, however some users report limited export formats.", f);
    assert.equal(l.dimensions.target.strength, "negative");
    assert.equal(l.dimensions.target.prominence, "low");
    assert.equal(l.recommended, "NOT_RECOMMENDED");
  });
  test("a mention listed under other options is low prominence and not recommended", () => {
    const l = labelAnswer("Opus Clip is the top pick.\n\nOther options:\n- Flowjin\n- Klap", f);
    assert.equal(l.dimensions.target.prominence, "low");
    assert.equal(l.dimensions.target.strength, "neutral");
  });
});

describe("rank, prominence and order", () => {
  test("explicit list rank 1 is high prominence with rank 1", () => {
    const d = labelAnswer("Top picks:\n1. **Flowjin** - finds highlights.\n2. Opus Clip - a solid choice.", f).dimensions.target;
    assert.equal(d.rank, 1);
    assert.equal(d.prominence, "high");
  });
  test("rank 3 is medium prominence and its rank is not inferred from text order", () => {
    const d = labelAnswer("Top picks:\n1. Opus Clip\n2. Klap\n3. **Flowjin** - finds highlights.", f).dimensions.target;
    assert.equal(d.rank, 3);
    assert.equal(d.prominence, "medium");
  });
  test("an unnumbered prose mention has no rank", () => {
    assert.equal(labelAnswer("Flowjin is one option among several.", f).dimensions.target.rank, null);
  });
  test("mention order follows first appearance among tracked brands", () => {
    const e = evaluateBrands("Opus Clip came first, then Flowjin, and later Klap.", f);
    assert.equal(e.competitors.find((c) => c.name === "Opus Clip")!.order, 1);
    assert.equal(e.target.order, 2);
    assert.equal(e.competitors.find((c) => c.name === "Klap")!.order, 3);
  });
});

describe("competitors and mention type", () => {
  test("a competitor can be recommended while the business is absent", () => {
    const l = labelAnswer("I recommend Opus Clip for podcasters.", f);
    assert.equal(l.mentioned, "NOT_MENTIONED");
    const opus = l.dimensions.competitors.find((c) => c.name === "Opus Clip")!;
    assert.equal(opus.mentioned, true);
    assert.equal(opus.strength, "qualified");
    assert.equal(l.dimensions.target.mentioned, false);
    assert.equal(l.dimensions.target.strength, "none");
  });
  test("an approved alias is recorded as an alias, the business name as explicit", () => {
    assert.equal(evaluateBrands("Flowjin AI is useful.", f).mentionType, "alias");
    assert.equal(evaluateBrands("Flowjin is useful.", f).mentionType, "explicit");
  });
});

describe("intent (lexical requirement coverage)", () => {
  const q = "What is the best affordable CRM for a small real estate agency in Canada?";
  test("requirements drop intent and generic words", () => {
    assert.deepEqual(requirementWords(q), ["affordable", "crm", "small", "real", "estate", "agency", "canada"]);
  });
  test("primary intent is classified", () => {
    assert.equal(primaryIntent("Which AI video clipping platform offers the best value for money?"), "purchase_decision");
    assert.equal(primaryIntent("OpusClip vs. other AI video clipping tools for agencies."), "comparison");
    assert.equal(primaryIntent("What are the best tools for podcast clips in Toronto?"), "local");
  });
  test("coverage ratio sets the status and a no-answer case is uncertain", () => {
    assert.equal(intentCoverage(q, "A affordable CRM for a small real estate agency in Canada, from $29 per month.").status, "fully_addressed");
    assert.equal(intentCoverage(q, "A CRM tool that many teams like.").status, "poorly_addressed");
    assert.equal(intentCoverage(q, null).status, "uncertain");
  });
});

describe("dimension aggregation", () => {
  function run(over: Partial<FinalRun> & { answer: string; question?: string }): FinalRun {
    const l = labelAnswer(over.answer, f, over.question ?? "What is the best AI clipping tool for podcasters?");
    return {
      aiRunId: over.aiRunId ?? Math.random().toString(36).slice(2), batchId: "b", questionId: over.questionId ?? "q1", questionText: "Q?", questionType: "RECOMMEND",
      provider: over.provider ?? "fake-a", model: "m", runNo: over.runNo ?? 1, status: "VALID", finishedAt: "2026-10-25T12:00:00Z",
      mention: l.mentioned === "MENTIONED" ? "MENTIONED" : "NOT_MENTIONED", recommend: l.recommended === null ? null : l.recommended, accuracy: l.accuracy,
      excerpt: null, answerText: over.answer, error: null, matchedTerm: l.matchedTerm, competitorMentions: l.competitorMentions, dims: l.dimensions, labelSource: "auto",
    };
  }
  test("rates use measured answers as the denominator and competitor pairs add up", () => {
    const runs = [
      run({ aiRunId: "1", runNo: 1, answer: "I recommend Flowjin because it finds highlights fast." }),
      run({ aiRunId: "2", runNo: 2, answer: "I recommend Opus Clip for podcasters." }),
      run({ aiRunId: "3", runNo: 3, answer: "Nothing relevant here." }),
      run({ aiRunId: "4", runNo: 4, answer: "Flowjin and Opus Clip are both listed." }),
    ];
    const cells = aggregateCells(runs, 1);
    const r = aggregateDimensions(runs, cells, f.competitors, 1);
    assert.equal(r.measured, 4);
    assert.equal(r.mention.count, 2);
    assert.equal(r.strongRecommendation.count, 1);
    assert.equal(r.competitorComparison.competitorRecommendedTargetNot, 1);
    assert.equal(r.competitorComparison.bothRecommended, 0);
    assert.equal(r.competitorComparison.neitherRecommended, 2);
    assert.equal(r.competitorComparison.targetRecommendedCompetitorNot, 1);
    assert.equal(r.implicitReference, null);
    assert.equal(r.citationAvailability.available, 0);
    assert.equal(r.brandAccuracy.rate, null);
  });
  test("answers without dimension data are not counted as measured", () => {
    const runs = [run({ aiRunId: "1", answer: "I recommend Flowjin." }), { ...run({ aiRunId: "2", answer: "I recommend Flowjin." }), dims: undefined }];
    const r = aggregateDimensions(runs, aggregateCells(runs, 1), f.competitors, 1);
    assert.equal(r.measured, 1);
    assert.equal(r.noDimensionData, 1);
  });
});
