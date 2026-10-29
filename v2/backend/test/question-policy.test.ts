import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isHowTo, questionProblem, competitorIn } from "../src/questions/policy";
import { generateCandidates, QGEN_TEMPLATE, TextGenerator } from "../src/questions/generate";
import { providerCoverage, CellResult } from "../src/ai/aggregate";
import { configuredProviders } from "../src/ai/providers";
import { loadAiConfig } from "../src/config";
import { flowjinFacts } from "./fixtures/flowjin/site";

const facts = { ...flowjinFacts, competitors: ["Opus Clip", "Descript"] };

describe("question policy (v2.3)", () => {
  test("how-to questions are detected, buyer questions are not", () => {
    for (const q of ["How do I set up a workflow to clip webinars?", "How can we add captions to clips?", "How to make short clips?", "What are the steps to repurpose a podcast?", "What's the best way to caption clips?"]) {
      assert.equal(isHowTo(q), true, q);
    }
    for (const q of ["How much do clip tools cost per month?", "How do most AI clipping tools charge?", "Which clip tool is best for podcasts?", "Why do my clips get few views?"]) {
      assert.equal(isHowTo(q), false, q);
    }
  });

  test("competitor names are rejected (word boundaries)", () => {
    assert.equal(competitorIn("Opus Clip vs Descript: which is better?", facts.competitors), "Opus Clip");
    assert.equal(competitorIn("Which tool is best for podcasts?", facts.competitors), null);
    assert.match(questionProblem("Is Descript good for podcasts?", facts) ?? "", /names the competitor "Descript"/);
  });

  test("business name and how-to are rejected with a reason", () => {
    assert.match(questionProblem("Is Flowjin worth it?", facts) ?? "", /business name/);
    assert.match(questionProblem("How do I caption a podcast?", facts) ?? "", /how-to/);
    assert.equal(questionProblem("Which clip tool is best for podcasts?", facts), null);
  });

  test("generation drops how-to and competitor questions and never tags HOWTO", async () => {
    const gen: TextGenerator = {
      provider: "fake",
      model: "m",
      generate: async () =>
        [
          "RECOMMEND: Which AI clip tool is best for podcasts?",
          "PROBLEM: How do I caption my podcast clips?",
          "COMPARE: Opus Clip vs Descript for podcasts?",
          "PRICE: How much do clip tools cost for a small team?",
          "PROBLEM: Why do my short clips get few views?",
          "HOWTO: What tool should I use to clip webinars?",
        ].join("\n"),
    };
    const out = await generateCandidates({ facts, generator: gen, customerQuestions: ["How can we batch-clip our talks?"] });
    const texts = out.candidates.map((c) => c.text);
    assert.ok(!texts.some((t) => /how do i|how can we|opus clip|descript/i.test(t)));
    assert.ok(out.removed.some((r) => /how-to/.test(r.reason)));
    assert.ok(out.removed.some((r) => /competitor "Opus Clip"/.test(r.reason)));
    assert.ok(out.candidates.every((c) => c.type !== ("HOWTO" as string)));
    assert.equal(out.mix.byType.PROBLEM + out.mix.byType.RECOMMEND + out.mix.byType.COMPARE + out.mix.byType.PRICE, out.candidates.length);
  });

  test("yes/no and 'is it better' questions are rejected because answers name no tool", () => {
    assert.match(questionProblem("Are AI clip makers actually better than editing shorts by hand?", facts) ?? "", /vague/);
    assert.match(questionProblem("Is it better to use a dedicated clipping tool or a recording platform?", facts) ?? "", /vague/);
    assert.equal(questionProblem("Which app is best for cutting podcasts into shorts?", facts), null);
    assert.equal(questionProblem("Is there a free tool to cut youtube videos?", facts), null);
  });

  test("long, polished questions are rejected; short casual ones are kept", () => {
    const long = "I spend hours scrubbing through hour-long streams to find good moments, and is there an AI tool that can solve that for my team?";
    assert.match(questionProblem(long, facts) ?? "", /too long/);
    assert.match(questionProblem("Clips?", facts) ?? "", /too short/);
    assert.equal(questionProblem("is there a free tool to cut my youtube videos", facts), null);
  });

  test("the generation prompt tells the model to avoid how-to questions and company names", () => {
    assert.match(QGEN_TEMPLATE, /Do not write how-to questions/);
    assert.match(QGEN_TEMPLATE, /Do not name any company/);
  });
});

describe("reporting and providers (v2.3)", () => {
  test("one reporting provider is preliminary; two is not", () => {
    const cell = (provider: string): CellResult => ({ questionId: "q", questionText: "Q?", questionType: "PRICE", provider, model: "m", status: "REPORTED", reason: null, nextStep: null, validRuns: 3, refusals: 0, errors: 0, timeouts: 0, mentioned: null, recommended: null, accuracy: null, excerpts: [], answersNotMentioning: [], answersNamed: [], lastRunAt: null });
    const one = providerCoverage([cell("anthropic")]);
    assert.equal(one.preliminary, true);
    assert.match(one.note ?? "", /Preliminary: only 1 provider/);
    const two = providerCoverage([cell("anthropic"), cell("gemini")]);
    assert.equal(two.preliminary, false);
    assert.equal(two.note, null);
  });

  test("OpenAI is off by default, even with a key set", () => {
    const cfg = loadAiConfig();
    assert.deepEqual(cfg.providers, ["anthropic", "gemini"]);
    const withKeys = { ...cfg, keys: { anthropic: "a", openai: "o", gemini: "g" } };
    assert.deepEqual(configuredProviders(withKeys).map((p) => p.name), ["anthropic", "gemini"]);
    const withOpenAi = { ...withKeys, providers: ["openai", "anthropic"] as typeof cfg.providers };
    assert.deepEqual(configuredProviders(withOpenAi).map((p) => p.name), ["anthropic", "openai"]);
  });
});
