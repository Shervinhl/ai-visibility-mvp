import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bagKey, balance, buildGenerationPrompt, classifyQuestion, exactKey, generateCandidates, mentionsBusiness, parseTaggedLines, queriesFromGscCsv, QGEN_TEMPLATE, TextGenerator, CandidateQuestion } from "../src/questions/generate";
import { draftStatus, freezeProblem } from "../src/questions/rules";
import { flowjinFacts } from "./fixtures/flowjin/site";
import { fakeGenerator } from "./helpers/fakeAi";

describe("question generation (B2)", () => {
  test("prompt uses the fixed template text", () => {
    const p = buildGenerationPrompt("AI video clipping tool", "podcasters", 12, []);
    assert.ok(p.startsWith(QGEN_TEMPLATE.replace("[product category]", "AI video clipping tool").replace("[buyer type]", "podcasters")));
  });
  test("parses tagged lines in several formats", () => {
    const parsed = parseTaggedLines("RECOMMEND: What is the best tool for clips?\n2. [PRICE] How much do clip tools cost?\n- How do I caption a podcast? (HOWTO)\nnot a question line\nCOMPARE | Is Descript better than Opus Clip?");
    assert.deepEqual(
      parsed.map((p) => p.type),
      ["RECOMMEND", "PRICE", "COMPARE"]
    );
    assert.equal(parsed[0].text, "What is the best tool for clips?");
  });
  test("duplicates: case, punctuation and word order", () => {
    assert.equal(exactKey("Best tool for clips?"), exactKey("best TOOL, for clips!"));
    assert.equal(bagKey("clips tool best for"), bagKey("Best tool for clips?"));
  });
  test("removes questions that name the business or an alias (word boundaries)", () => {
    assert.equal(mentionsBusiness("Is Flowjin good?", flowjinFacts), "Flowjin");
    assert.ok(mentionsBusiness("Is flowjin.com legit?", flowjinFacts));
    assert.equal(mentionsBusiness("Try Flowjin AI", { businessName: "Nope", aliases: ["Flowjin AI"] }), "Flowjin AI");
    assert.equal(mentionsBusiness("Best flow tools?", flowjinFacts), null);
  });
  test("classifies client questions by rule", () => {
    assert.equal(classifyQuestion("Opus Clip vs Descript for podcasts"), "COMPARE");
    assert.equal(classifyQuestion("how much does an AI clipping tool cost"), "PRICE");
    assert.equal(classifyQuestion("best AI tool to clip podcasts"), "RECOMMEND");
    assert.equal(classifyQuestion("how do I add captions to a short video"), "PROBLEM");
    assert.equal(classifyQuestion("my clips get no views on TikTok"), "PROBLEM");
  });
  test("reads a Search Console CSV export and keeps question-like queries", () => {
    const csv = 'Top queries,Clicks,Impressions\n"best ai clip maker for podcasts",12,300\nflowjin,50,90\nclips,3,40\n"how to turn a podcast into shorts",4,77\n';
    assert.deepEqual(queriesFromGscCsv(csv), ["best ai clip maker for podcasts", "how to turn a podcast into shorts"]);
  });
  test("generates 30-40 candidates, all CANDIDATE-ready, no brand, no duplicates, mix reported", async () => {
    const gen = await generateCandidates({ facts: flowjinFacts, generator: fakeGenerator(), customerQuestions: ["What's the best AI tool to clip podcasts?", "Is Flowjin worth it?"] });
    assert.ok(gen.candidates.length >= 30 && gen.candidates.length <= 40, `got ${gen.candidates.length}`);
    assert.ok(gen.candidates.every((c) => !mentionsBusiness(c.text, flowjinFacts)));
    assert.equal(new Set(gen.candidates.map((c) => bagKey(c.text))).size, gen.candidates.length);
    assert.ok(gen.removed.some((r) => /business name/.test(r.reason)));
    assert.ok(gen.removed.some((r) => /duplicate/.test(r.reason)));
    assert.equal(gen.mix.total, gen.candidates.length);
    assert.equal(gen.mix.byGroup.RECOMMEND + gen.mix.byGroup.COMPARE_OR_PRICE + gen.mix.byGroup.PROBLEM, gen.candidates.length);
    assert.equal(gen.candidates.filter((c) => c.source === "CUSTOMER").length, 1);
  });
  test("without a provider, only client questions are used and a warning names the missing keys", async () => {
    const gen = await generateCandidates({ facts: flowjinFacts, generator: null, customerQuestions: ["best clip tool for podcasts"] });
    assert.equal(gen.candidates.length, 1);
    assert.ok(gen.warnings.some((w) => /ANTHROPIC_API_KEY/.test(w)));
  });
  test("balance keeps the three groups even when trimming to 40", () => {
    const qs: CandidateQuestion[] = [];
    for (let i = 0; i < 30; i++) qs.push({ text: `rec ${i}`, type: "RECOMMEND", source: "LLM" });
    for (let i = 0; i < 15; i++) qs.push({ text: `cmp ${i}`, type: "COMPARE", source: "LLM" });
    for (let i = 0; i < 15; i++) qs.push({ text: `problem ${i}`, type: "PROBLEM", source: "LLM" });
    const out = balance(qs, 40);
    assert.equal(out.length, 40);
    assert.ok(out.filter((q) => q.type === "RECOMMEND").length <= 14);
  });
  test("generator errors propagate (no silent empty set)", async () => {
    const broken: TextGenerator = { provider: "fake", model: "x", generate: async () => { throw new Error("boom"); } };
    await assert.rejects(generateCandidates({ facts: flowjinFacts, generator: broken }));
  });
});

describe("review and freeze rules (B3)", () => {
  test("freeze needs 20 to 40 approved questions", () => {
    assert.match(freezeProblem(19, "CANDIDATE") ?? "", /at least 20/);
    assert.equal(freezeProblem(20, "CANDIDATE"), null);
    assert.equal(freezeProblem(40, "APPROVED"), null);
    assert.match(freezeProblem(41, "APPROVED") ?? "", /At most 40/);
    assert.match(freezeProblem(25, "FROZEN") ?? "", /already frozen/);
  });
  test("set becomes APPROVED only when nothing is undecided and the count is valid", () => {
    assert.equal(draftStatus({ candidate: 1, approved: 25 }), "CANDIDATE");
    assert.equal(draftStatus({ candidate: 0, approved: 25 }), "APPROVED");
    assert.equal(draftStatus({ candidate: 0, approved: 10 }), "CANDIDATE");
  });
});
