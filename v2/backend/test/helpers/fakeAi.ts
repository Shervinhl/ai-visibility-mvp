import { FakeProvider, FakeScript } from "../../src/ai/providers";
import { TextGenerator } from "../../src/questions/generate";

/** Deterministic string hash (no randomness in fixtures). */
export function h(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
}

/**
 * Fake question generator. Reads the buyer type from the prompt and returns 14 tagged lines:
 * 12 buyer-specific questions, 1 question shared by every buyer (a duplicate to be removed),
 * and 1 question that names Flowjin (to be removed).
 */
export function fakeGenerator(): TextGenerator {
  return {
    provider: "fake-generator",
    model: "fake-gen-1",
    generate: async (prompt: string) => {
      const buyer = /for ([^.]+?)\. Write natural/.exec(prompt)?.[1] ?? "buyers";
      const b = buyer.replace(/^AI video clipping tool for /, "");
      return [
        `RECOMMEND: What is the best AI tool to turn long videos into short clips for ${b}?`,
        `RECOMMEND: Which AI clipping app should ${b} use for TikTok?`,
        `RECOMMEND: Top AI video repurposing tools for ${b} in 2026?`,
        `RECOMMEND: What app do ${b} use to make YouTube Shorts from long videos?`,
        `COMPARE: Opus Clip vs Descript for ${b}: which is better?`,
        `COMPARE: What are good alternatives to Opus Clip for ${b}?`,
        `PRICE: How much does an AI clip maker cost for ${b}?`,
        `PRICE: Is there a free AI video clipping tool for ${b}?`,
        `HOWTO: How do ${b} turn a one-hour video into short clips?`,
        `HOWTO: How can ${b} add captions to short clips automatically?`,
        `PROBLEM: Why do the short clips from ${b} get so few views?`,
        `PROBLEM: Editing clips by hand takes ${b} too long. What can help?`,
        `RECOMMEND: What is the best AI video clipping tool?`,
        `RECOMMEND: Is Flowjin good for ${b}?`,
      ].join("\n");
    },
  };
}

const shortlist = (rank: number, q: string) => `Here are strong options for this:

1. **Opus Clip** - popular for viral-style clips.
${rank === 2 ? "2. **Flowjin** - a great choice for podcasters; it finds highlight moments and adds Automatic captions.\n3. **Descript** - a full editor with clipping features." : "2. **Descript** - a full editor with clipping features.\n3. **Flowjin** - turns long videos into captioned short clips; I'd recommend it if you publish podcasts weekly."}

Pick based on budget and how much editing you want to do. (${q.length})`;

const otherOptions = (q: string) => `The most common choices are Opus Clip and Descript.

Other options:
- Vizard
- Flowjin
- Klap

(${q.length})`;

const withWarning = () => `Opus Clip is the most widely used. Flowjin is another option, but some users report limited export formats. Descript is better if you also need full editing.`;

const noMention = (q: string) => `Start with the transcript, find moments with a strong hook, keep clips between 20 and 60 seconds, and add captions. Tools like Opus Clip and Descript can help. (${q.length})`;

const priceAnswer = () => `Prices vary. Opus Clip has a free tier. Flowjin costs about $19 per month for its creator plan. Descript starts around $12 per month.`;

/** Provider "alpha": mentions Flowjin often; deterministic by question text and run number. */
export const alphaScript: FakeScript = (q, call) => {
  const k = h(q);
  if (/\b(cost|free)\b/i.test(q)) return { text: priceAnswer() };
  if (/^How (do|can)/.test(q)) return { text: noMention(q) };
  if (/views|too long/.test(q)) return { text: k % 2 === 0 ? withWarning() : noMention(q) };
  if (k % 3 === 0) return { text: otherOptions(q) };
  return { text: shortlist(call % 2 === 0 ? 2 : 3, q) };
};

/** Provider "beta": mentions less, plus one timeout question, one refusal, and a 429 that recovers. */
export const betaScript: FakeScript = (q, call) => {
  const k = h(q);
  if (/turn a one-hour video/.test(q) && /podcasters/.test(q)) return "timeout";
  if (/so few views/.test(q) && /podcasters/.test(q)) return { text: "I'm sorry, but I can't help with that request." };
  if (/TikTok/.test(q) && /podcasters/.test(q) && call === 1) return { error: 429, retryAfter: "1" };
  if (/\b(cost|free)\b/i.test(q)) return { text: noMention(q) };
  if (k % 4 === 0) return { text: shortlist(2, q) };
  if (k % 4 === 1) return { text: otherOptions(q) };
  return { text: noMention(q) };
};

export function flowjinProviders(): FakeProvider[] {
  return [new FakeProvider("fake-alpha", "alpha-1", alphaScript), new FakeProvider("fake-beta", "beta-1", betaScript)];
}
