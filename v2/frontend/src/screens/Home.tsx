import type { Page } from "../components/Site";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Eyebrow } from "../components/Site";

interface Props {
  onNavigate: (p: Page) => void;
}

const PILLARS = [
  {
    title: "Can AI read your site?",
    body: "Twelve technical checks show whether AI crawlers can reach your pages, read your words without running scripts, and find your prices, contact details and structured data.",
  },
  {
    title: "Does AI mention you?",
    body: "A fixed set of buyer questions, approved by you, is asked to the AI tools you configure. You see whether you are mentioned, recommended and described correctly.",
  },
  {
    title: "Did the fix work?",
    body: "After you change your site, the same questions are asked again with the same providers. Before and after sit side by side, so the change is shown, not guessed.",
  },
];

const STEPS = [
  ["Describe your business", "Fill the setup form, or let the AI read your website and fill every field. Edit anything it gets wrong."],
  ["Check your website", "Run the technical checks. Each finding says what was checked, what was found and what to change."],
  ["Approve your questions", "The AI drafts buyer questions from your business definition. Add, edit or remove until you have 20 to 40 you agree with."],
  ["Test and re-test", "Ask the AI tools your questions, fix what the checks found, then re-test and compare the results."],
];

const PRINCIPLES = [
  ["No single number", "Every check and every AI answer is shown on its own. Nothing is averaged into one figure that hides what to fix."],
  ["Plain reasons", "Each result names what was checked, what was found, why it matters and the next step."],
  ["Gaps stay visible", "Anything we could not check yet stays on the page, with the missing input named."],
  ["Fair to every page type", "Legal pages are not judged by marketing rules, so they are marked as not applicable."],
];

const ROADMAP = [
  "Scheduled re-tests, so changes show up without starting a run by hand",
  "Competitor comparison on the same questions",
  "More AI tools, added once their answers can be recorded reliably",
  "Shareable reports for clients and internal teams",
  "Alerts when an AI answer about your business changes",
];

const FAQ = [
  [
    "Do I need my own AI accounts?",
    "Yes. You add your own provider keys (Anthropic, OpenAI or Gemini), and each provider bills its own usage. The AI answer test needs at least two configured providers.",
  ],
  [
    "Why is there no overall score?",
    "One number hides what to fix. You get separate results with reasons, so each change can be tested on its own.",
  ],
  [
    "Does it check my whole site?",
    "It checks the key pages you list, up to 20. It follows robots.txt and identifies itself as BesigniticsVisibilityCheck.",
  ],
  [
    "What does “Not checked yet” mean?",
    "We could not finish that check, usually because a page did not load or a required input is missing. The reason and the next step are shown next to it.",
  ],
];

function ExampleCard() {
  const rows: { area: string; text: string; status: string; tone: string }[] = [
    { area: "Checks", text: "Robots.txt lets AI crawlers in", status: "Passed", tone: "bg-emerald-100 text-emerald-800" },
    { area: "Checks", text: "Meta description is 50 to 160 characters", status: "Needs a fix", tone: "bg-rose-100 text-rose-800" },
    { area: "Checks", text: "Legal page: description not required", status: "Not applicable", tone: "bg-slate-100 text-slate-600" },
    { area: "AI answers", text: "“Who can help me with this service?”", status: "Mentioned", tone: "bg-emerald-100 text-emerald-800" },
    { area: "Re-test", text: "Same question after the fix", status: "Compared", tone: "bg-sky-100 text-sky-800" },
  ];
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Example layout</p>
        <p className="text-xs text-slate-400">Illustrative only</p>
      </div>
      <ul className="mt-5 divide-y divide-stone-100">
        {rows.map((r) => (
          <li key={r.text} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{r.area}</p>
              <p className="truncate text-sm text-slate-800">{r.text}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${r.tone}`}>{r.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        Each row keeps its own reason and next step. There is no total to read.
      </p>
    </div>
  );
}

export default function Home({ onNavigate }: Props) {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
        <div>
          <span className="inline-flex items-center rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            AI visibility, shown step by step
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl sm:leading-[1.05]">
            Find out what AI tools say about your business, then prove what changed.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Besignitics checks whether AI assistants can read your website, asks them the questions your buyers ask, and tests
            again after every fix. Each result comes with the evidence behind it.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button type="button" className={BUTTON_PRIMARY} onClick={() => onNavigate("tool")}>
              Start a visibility check
            </button>
            <button type="button" className={BUTTON_SECONDARY} onClick={() => onNavigate("solutions")}>
              See what it does today
            </button>
          </div>
        </div>
        <ExampleCard />
      </section>

      {/* Three questions */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Eyebrow>Three questions, answered separately</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Each question has its own evidence, so you know what to fix next.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <article key={p.title} className="rounded-3xl border border-stone-200 bg-stone-50 p-7">
                <p className="text-sm font-semibold text-slate-400">0{i + 1}</p>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Four steps, in the order that matters.</h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-stone-200 bg-stone-200 md:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="bg-white p-7">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{i + 1}</span>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Principles */}
      <section className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <Eyebrow>How we report</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Built so you can check our work.</h2>
          <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {PRINCIPLES.map(([t, b]) => (
              <div key={t} className="border-t border-slate-800 pt-6">
                <dt className="text-lg font-semibold">{t}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Roadmap */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-2">
        <div>
          <Eyebrow>Where it can go next</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Planned, not built yet.</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">
            These directions follow from the checks and tests we run today. None of them is live, and the order may change.
          </p>
        </div>
        <ul className="divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-white">
          {ROADMAP.map((item) => (
            <li key={item} className="flex items-start gap-4 px-6 py-5 text-sm text-slate-700">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-20">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Good to know before you start.</h2>
        <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900">
                {q}
                <span className="text-xl leading-none text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-slate-900 px-8 py-12 text-white sm:flex-row sm:items-center sm:px-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Run your first check.</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">
              Start with your website. You will see each result, its reason and its next step before you change anything.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-stone-200"
            onClick={() => onNavigate("tool")}
          >
            Start a visibility check
          </button>
        </div>
      </section>
    </div>
  );
}
