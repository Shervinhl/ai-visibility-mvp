import type { Page } from "../components/Site";
import { BUTTON_PRIMARY, Eyebrow } from "../components/Site";

interface Props {
  onNavigate: (p: Page) => void;
}

interface Solution {
  number: string;
  name: string;
  answers: string;
  does: string[];
  youProvide: string;
}

/** Only what the app does today. Planned work lives on the Home page. */
const SOLUTIONS: Solution[] = [
  {
    number: "01",
    name: "Can AI read your site?",
    answers: "Can AI crawlers reach your key pages, and can they read the words on them without running scripts?",
    does: [
      "Twelve checks: robots.txt access, page loads, text in the HTML, title and heading, meta description, business basics, prices in the HTML, canonical tag, noindex, sitemap, link paths and structured data.",
      "One finding per check, with what was checked, what was found, why it matters, what to change and how to re-test.",
      "Legal pages are marked not applicable for checks that do not suit them.",
    ],
    youProvide: "Your website address and the key pages to check.",
  },
  {
    number: "02",
    name: "Business setup",
    answers: "Does the app hold the facts about your business that the checks and questions depend on?",
    does: [
      "Fill all fields from my website: the AI reads your homepage and linked pages such as pricing, contact, about and product pages.",
      "Required fields are marked with *, and any field with a problem gets a red border with the reason.",
      "You can edit every value. Nothing is saved until you confirm it.",
    ],
    youProvide: "Business name, what you do and how to contact you. A location is filled automatically only if it appears on the site.",
  },
  {
    number: "03",
    name: "Question review",
    answers: "Which buyer questions should AI tools be asked about your business, without your name in them?",
    does: [
      "The AI drafts candidate questions from your business definition.",
      "You add, edit or remove questions. Each question keeps its review status.",
      "Freezing the set needs 20 to 40 approved questions. A frozen set stays the same for every later test.",
    ],
    youProvide: "Your approval of each question.",
  },
  {
    number: "04",
    name: "Does AI mention you?",
    answers: "When buyers ask those questions, do AI tools mention you, recommend you and describe you correctly?",
    does: [
      "Asks each frozen question to every configured AI provider.",
      "Records whether you are mentioned, whether you are recommended, and whether the description is correct, incorrect, ambiguous or cannot be verified.",
      "Every answer is kept with its question and provider, so you can read the evidence yourself.",
    ],
    youProvide: "At least two AI provider keys, and your review of each answer.",
  },
  {
    number: "05",
    name: "Re-test comparison",
    answers: "Did the changes you made move the answers?",
    does: [
      "Runs the same frozen questions with the same providers and settings.",
      "Shows the earlier and later results side by side, question by question.",
    ],
    youProvide: "Time between the first test and the re-test, after you have made your changes.",
  },
];

const LIMITS = [
  "Checks the text of the key pages you list. Social profiles and business directories are not checked yet.",
  "Does not compare you with competitors yet.",
  "Re-tests are started by hand from the app.",
  "AI answers can change from day to day, so a single test shows one moment, not a trend.",
];

export default function Solutions({ onNavigate }: Props) {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 lg:pt-24">
        <Eyebrow>Solutions</Eyebrow>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          What the app does today.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
          Five parts, used in order. Each one produces its own results, so you can act on one finding without waiting for the rest.
        </p>
        <div className="mt-8">
          <button type="button" className={BUTTON_PRIMARY} onClick={() => onNavigate("tool")}>
            Open the visibility check
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <ol className="space-y-6">
          {SOLUTIONS.map((s) => (
            <li key={s.number} className="grid gap-8 rounded-3xl border border-stone-200 bg-white p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:p-10">
              <div>
                <p className="text-sm font-semibold text-slate-400">{s.number}</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{s.name}</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{s.answers}</p>
                <span className="mt-5 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Available now
                </span>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What it does</p>
                  <ul className="mt-3 space-y-3">
                    {s.does.map((d) => (
                      <li key={d} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-stone-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What you provide</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{s.youProvide}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-2">
          <div>
            <Eyebrow>Current limits</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">What it does not do yet.</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">
              We would rather state these now than have you find them later.
            </p>
          </div>
          <ul className="divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-stone-50">
            {LIMITS.map((l) => (
              <li key={l} className="px-6 py-5 text-sm leading-relaxed text-slate-700">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
