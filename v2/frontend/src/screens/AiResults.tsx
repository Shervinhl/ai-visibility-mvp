import { useCallback, useEffect, useState } from "react";
import { api, BusinessDetail, Cell, DimensionReport, errorText, fmtDate, Overall, pct, RateRow, ReviewItem, RunsView } from "../api";
import { Badge, Expand, Notice, Section } from "../components/ui";

function OverallLine({ o }: { o: Overall }) {
  return (
    <div className="text-sm">
      <div>
        <span className="font-semibold capitalize">{o.scope}:</span> {o.mentioned.text}
        {o.mentioned.wilson95 && <span className="text-slate-500"> ({pct(o.mentioned.wilson95)})</span>}; {o.recommended.text}
        {o.recommended.wilson95 && <span className="text-slate-500"> ({pct(o.recommended.wilson95)})</span>}.
      </div>
      {o.mentioned.note && <div className="text-xs text-amber-800">{o.mentioned.note}</div>}
      {o.mentioned.pendingReview > 0 && <div className="text-xs text-amber-800">{o.mentioned.pendingReview} answer(s) await human review and are not counted yet.</div>}
      {o.autoLabelOnly > 0 && <div className="text-xs text-amber-800">{o.autoLabelOnly} answer(s) use an automatic label that no person has checked yet. These results are provisional.</div>}
      <div className="text-xs text-slate-500">
        Not counted: {o.excludedRefusals} refusal(s), {o.excludedErrors} error(s), {o.excludedTimeouts} timeout(s).
      </div>
    </div>
  );
}

/** Text around the first match of the business name, so the mention is visible even deep in a long answer. */
function aroundTerm(text: string, term: string | null, radius = 160): string {
  if (!term) return shortAnswer(text);
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return shortAnswer(text);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  const plain = text.slice(start, end).replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${plain}${end < text.length ? "…" : ""}`;
}

/** First two sentences (max 280 characters) of an answer, with markdown symbols removed. The full text stays one click away. */
function shortAnswer(text: string, max = 280): string {
  const plain = text.replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [plain];
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    if (out && (out + s).length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length > max ? `${out.slice(0, max).trimEnd()}…` : out;
}

const TYPE_NAME: Record<string, string> = { RECOMMEND: "Recommendation", COMPARE: "Comparison", PRICE: "Price", PROBLEM: "Problem" };

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "good" | "bad" | "muted" }) {
  const box = tone === "good" ? "border-emerald-200 bg-emerald-50" : tone === "bad" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded-lg border px-3 py-2 ${box}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600">{hint}</div>
    </div>
  );
}

/** "3 of 10 (30%)": the count and its denominator are always shown with the percentage. */
function rateText(r: RateRow): string {
  if (!r.of) return "no answers yet";
  return `${r.count} of ${r.of} (${Math.round((100 * r.count) / r.of)}%)`;
}

function DimensionsPanel({ d }: { d: DimensionReport }) {
  const cell = "px-2 py-1 text-right";
  return (
    <div className="card space-y-3 text-sm">
      <div>
        <div className="font-semibold">Measurement details ({d.rulesVersion})</div>
        <div className="text-xs text-slate-500">
          Based on {d.measured} measured answers out of {d.validAnswers} valid ones{d.pendingAmbiguous ? `; ${d.pendingAmbiguous} wait for a person to decide if the name refers to your business` : ""}
          {d.noDimensionData ? `; ${d.noDimensionData} were labeled before these measures existed (run the test again to include them)` : ""}.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Explicit mention" value={rateText(d.explicitMention)} hint="Your business name appears" tone="muted" />
        <Stat label="Alias mention" value={rateText(d.aliasMention)} hint="An approved alias appears" tone="muted" />
        <Stat label="Recommended" value={rateText(d.recommendation)} hint="Strong or conditional" tone="good" />
        <Stat label="Strong recommendation" value={rateText(d.strongRecommendation)} hint="Clear endorsement" tone="good" />
        <Stat label="Negative mention" value={rateText(d.negativeMention)} hint="Named with a warning" tone="bad" />
        <Stat label="High prominence" value={rateText(d.highProminence)} hint="First choice or clearly emphasized" tone="muted" />
        <Stat label="Intent: fully addressed" value={rateText(d.intentAlignment.fully)} hint={d.intentAlignment.note} tone="muted" />
        <Stat label="Citations exposed" value={`${d.citationAvailability.available} of ${d.citationAvailability.of}`} hint={d.citationAvailability.note} tone="muted" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1">Brand</th>
              <th className={cell}>Mentioned</th>
              <th className={cell}>Recommended</th>
              <th className={cell}>Strong</th>
              <th className={cell}>High prominence</th>
            </tr>
          </thead>
          <tbody>
            {[d.target, ...d.competitors].map((row, i) => (
              <tr key={row.name} className={`border-t ${i === 0 ? "bg-emerald-50 font-semibold" : ""}`}>
                <td className="px-2 py-1">{i === 0 ? `Your business` : row.name}</td>
                <td className={cell}>{rateText(row.mentioned)}</td>
                <td className={cell}>{rateText(row.recommended)}</td>
                <td className={cell}>{rateText(row.strongRecommendation)}</td>
                <td className={cell}>{rateText(row.highProminence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-600">
        Head to head ({d.competitorComparison.of} answers): a competitor recommended but not you in {d.competitorComparison.competitorRecommendedTargetNot}; you recommended but no competitor in {d.competitorComparison.targetRecommendedCompetitorNot}; both in {d.competitorComparison.bothRecommended}; neither in {d.competitorComparison.neitherRecommended}.
        A higher mention rate for a competitor is an observation about AI answers, not proof of better content or SEO.
      </div>
      {d.brandAccuracy.note && <div className="text-xs text-slate-500">{d.brandAccuracy.note}</div>}
      {d.brandAccuracy.evaluable > 0 && (
        <div className="text-xs text-slate-600">
          Claims: {d.brandAccuracy.correct} correct, {d.brandAccuracy.incorrect} incorrect, {d.brandAccuracy.unverifiable} unverifiable (not counted in the rate).
        </div>
      )}
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">Not measured yet, and why</summary>
        <ul className="mt-1 list-disc pl-5">
          {d.notMeasured.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ResultCard({ c }: { c: Cell }) {
  const header = (
    <div>
      <p className="text-base font-medium text-slate-900">{c.questionText}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {TYPE_NAME[c.questionType] ?? c.questionType} · {c.provider} ({c.model})
      </p>
    </div>
  );

  if (c.status === "NOT_ASSESSED") {
    return (
      <article className="rounded-xl border border-amber-200 bg-white p-4">
        {header}
        <p className="mt-3 text-sm text-slate-800">Not checked yet: {c.reason}</p>
        <p className="mt-1 text-sm text-slate-500">Next step: {c.nextStep}</p>
      </article>
    );
  }

  const named = c.mentioned?.count ?? 0;
  const namedOf = c.mentioned?.of ?? 0;
  const pendingNamed = c.mentioned?.pendingReview ?? 0;
  const recommended = c.recommended?.count ?? 0;
  const recommendedOf = c.recommended?.of ?? 0;
  const a = c.accuracy;
  const checkedDetails = a ? a.correct + a.incorrect + a.unverifiable : 0;
  const toCheck = a?.pendingReview ?? 0;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      {header}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Named"
          value={`${named} of ${namedOf}`}
          hint={named ? "answers name your business" : "no answer named your business"}
          tone={named > 0 ? "good" : "bad"}
        />
        <Stat
          label="Recommended"
          value={`${recommended} of ${recommendedOf}`}
          hint={recommended ? "answers recommend your business" : "no answer recommended your business"}
          tone={recommended > 0 ? "good" : "bad"}
        />
        <Stat
          label="Details when named"
          value={checkedDetails ? `${a?.correct ?? 0} correct` : "–"}
          hint={
            checkedDetails || toCheck
              ? `${a?.incorrect ?? 0} wrong · ${a?.unverifiable ?? 0} can't verify${toCheck ? ` · ${toCheck} to check` : ""}`
              : "nothing to check yet"
          }
          tone={(a?.incorrect ?? 0) > 0 ? "bad" : "muted"}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Named</span> = your business name appears in the answer.{" "}
        <span className="font-semibold text-slate-700">Recommended</span> = the answer suggests your business as a choice. An answer can name you without recommending you.
      </p>
      {pendingNamed > 0 && <p className="mt-2 text-xs text-amber-800">{pendingNamed} answer(s) are waiting for a person to check.</p>}

      {c.answersNamed.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Where {c.provider} named your business ({c.answersNamed.length})
          </p>
          <ul className="mt-2 space-y-2">
            {c.answersNamed.map((x) => (
              <li key={x.runNo} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-slate-700">
                <div className="text-[11px] text-slate-400">
                  Run {x.runNo} · {fmtDate(x.date)} · matched “{x.matchedTerm ?? "name"}” · {x.recommended ? "recommended" : "not recommended"} · {x.labelSource === "human" ? "checked by a person" : "not yet checked"}
                </div>
                <div>{aroundTerm(x.text, x.matchedTerm)}</div>
                <Expand label="Full answer">
                  <div className="whitespace-pre-wrap text-slate-600">{x.text}</div>
                </Expand>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.answersNotMentioning.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            What {c.provider} answered when it did not name you ({c.answersNotMentioning.length})
          </p>
          <ul className="mt-2 space-y-2">
            {c.answersNotMentioning.map((x) => (
              <li key={x.runNo} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-slate-700">
                <div className="text-[11px] text-slate-400">
                  Run {x.runNo} · {fmtDate(x.date)} · {x.labelSource === "human" ? "checked by a person" : "not yet checked"}
                </div>
                <div>{shortAnswer(x.text)}</div>
                <Expand label="Full answer">
                  <div className="whitespace-pre-wrap text-slate-600">{x.text}</div>
                </Expand>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.excerpts.length > 0 && (
        <div className="mt-3">
          <Expand label={`Where your name appears (${c.excerpts.length})`}>
            {c.excerpts.map((e) => (
              <blockquote key={e.runNo} className="mb-2 border-l-2 border-emerald-300 pl-2 text-sm text-slate-700">
                <div className="text-[11px] text-slate-400">
                  Run {e.runNo} · {fmtDate(e.date)}
                </div>
                {e.excerpt}
              </blockquote>
            ))}
          </Expand>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        {c.validRuns} valid runs · {c.refusals} refused · {c.errors} errors · {c.timeouts} timeouts · last run {fmtDate(c.lastRunAt)}
      </p>
    </article>
  );
}

function ReviewCard({ item, reviewer, onSaved }: { item: ReviewItem; reviewer: string; onSaved: () => Promise<void> }) {
  const [mentioned, setMentioned] = useState<"MENTIONED" | "NOT_MENTIONED">(item.autoLabel?.mentioned === "NOT_MENTIONED" ? "NOT_MENTIONED" : "MENTIONED");
  const [recommended, setRecommended] = useState<"RECOMMENDED" | "NOT_RECOMMENDED">(item.autoLabel?.recommended === "RECOMMENDED" ? "RECOMMENDED" : "NOT_RECOMMENDED");
  const [accuracy, setAccuracy] = useState<"CORRECT" | "INCORRECT" | "UNVERIFIABLE">((item.autoLabel?.accuracy as "CORRECT" | "INCORRECT" | "UNVERIFIABLE") ?? "UNVERIFIABLE");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try {
      await api.post(`/ai-runs/${item.aiRunId}/labels`, { mentioned, recommended: mentioned === "MENTIONED" ? recommended : undefined, accuracy: mentioned === "MENTIONED" ? accuracy : undefined, labeledBy: reviewer, note });
      await onSaved();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{item.questionText}</span> <span className="text-slate-500">· {item.provider} · run {item.runNo}</span>
        </div>
        <div className="flex gap-1">
          {item.reasons.map((r) => (
            <span key={r} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
              {r}
            </span>
          ))}
          {item.done && <Badge status="DONE" />}
        </div>
      </div>
      {item.autoLabel && (
        <div className="flex flex-wrap gap-1 text-xs">
          Automatic label: <Badge status={item.autoLabel.mentioned} /> {item.autoLabel.recommended && <Badge status={item.autoLabel.recommended} />} {item.autoLabel.accuracy && <Badge status={item.autoLabel.accuracy} />}
        </div>
      )}
      <Expand label="Full answer">
        <pre className="evidence whitespace-pre-wrap">{item.answerText}</pre>
      </Expand>
      {item.autoLabel && (
        <Expand label="Rule evidence">
          <pre className="evidence">{JSON.stringify(item.autoLabel.details, null, 2)}</pre>
        </Expand>
      )}
      {item.humanLabels.map((h, i) => (
        <div key={i} className="text-xs text-slate-600">
          Human label by {h.labeledBy} ({fmtDate(h.labeledAt)}): {h.mentioned} {h.recommended ?? ""} {h.accuracy ?? ""} {h.note ? `· ${h.note}` : ""}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        <select className="input w-40" value={mentioned} onChange={(e) => setMentioned(e.target.value as typeof mentioned)}>
          <option>MENTIONED</option>
          <option>NOT_MENTIONED</option>
        </select>
        <select className="input w-44" value={recommended} disabled={mentioned !== "MENTIONED"} onChange={(e) => setRecommended(e.target.value as typeof recommended)}>
          <option>RECOMMENDED</option>
          <option>NOT_RECOMMENDED</option>
        </select>
        <select className="input w-40" value={accuracy} disabled={mentioned !== "MENTIONED"} onChange={(e) => setAccuracy(e.target.value as typeof accuracy)}>
          <option>CORRECT</option>
          <option>INCORRECT</option>
          <option>UNVERIFIABLE</option>
        </select>
        <input className="input flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" disabled={reviewer.trim().length < 2} onClick={save}>
          Save label
        </button>
      </div>
      {reviewer.trim().length < 2 && <div className="text-xs text-amber-800">Enter your name at the top to label.</div>}
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  );
}

export default function AiResults({ detail, reviewer, onChanged }: { detail: BusinessDetail; reviewer: string; onChanged: () => Promise<void> }) {
  const frozenSets = detail.questionSets.filter((s) => s.status === "FROZEN");
  const [setId, setSetId] = useState<string | null>(frozenSets[0]?.id ?? null);
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<RunsView | null>(null);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    setSetId(frozenSets[0]?.id ?? null);
    setRunId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.business.id]);

  const load = useCallback(async () => {
    if (!setId) {
      setView(null);
      return;
    }
    try {
      const { data } = await api.get<RunsView>(`/question-sets/${setId}/runs`, { params: runId ? { runId } : {} });
      setView(data);
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  }, [setId, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = view?.runs.some((r) => r.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const start = async () => {
    if (!setId) return;
    setMsg(null);
    try {
      const { data } = await api.post<{ runId: string; plannedRuns: number; providers: { provider: string; model: string }[] }>(`/question-sets/${setId}/runs`, {});
      setMsg({ kind: "info", text: `Started: ${data.plannedRuns} runs on ${data.providers.map((p) => `${p.provider} (${p.model})`).join(" and ")}.` });
      setRunId(data.runId);
      await onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const queue = (view?.reviewQueue ?? []).filter((i) => showDone || !i.done);

  return (
    <Section
      title="Does AI mention you?"
      subtitle="Approved buyer questions asked to two or more AI assistants through their official APIs, three times each. Counts only, no score."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-56" value={setId ?? ""} onChange={(e) => { setSetId(e.target.value || null); setRunId(null); }}>
            {frozenSets.length === 0 && <option value="">No frozen question set</option>}
            {frozenSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.version} · frozen {fmtDate(s.frozenAt)}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!setId} onClick={start}>
            Run questions
          </button>
        </div>
      }
    >
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {frozenSets.length === 0 && <Notice>We could not check this yet. Needs: an approved and frozen question set (Question review screen).</Notice>}
      {view && (
        <>
          <div className="card text-sm">
            <div className="mb-1 font-semibold">Runs on {view.questionSet.version}</div>
            {view.runs.length === 0 && <div className="text-slate-500">No runs yet.</div>}
            <ul className="space-y-1">
              {view.runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <input type="radio" name="run" checked={view.shownRunIds.includes(r.id)} onChange={() => setRunId(r.id)} />
                  <Badge status={r.status} /> {fmtDate(r.startedAt)} · {r.providers.join(", ")} · {r.progress.finalRuns} runs done ({r.progress.attempts} attempts)
                  {r.error && <span className="text-rose-700">{r.error}</span>}
                </li>
              ))}
            </ul>
          </div>
          {view.coverage.preliminary && view.coverage.note && <Notice kind="warn">{view.coverage.note}</Notice>}
          {view.overall && (
            <div className="card space-y-2">
              <div className="font-semibold">Across the question set</div>
              <OverallLine o={view.overall} />
              {view.perProvider.map((p) => (
                <OverallLine key={p.scope} o={p} />
              ))}
            </div>
          )}
          {view.competitors.length > 0 && (
            <div className="card text-sm">
              <div className="mb-1 font-semibold">Competitor mentions (shown separately; no share-of-voice)</div>
              <ul className="list-disc pl-5">
                {view.competitors.map((c) => (
                  <li key={c.competitor}>{c.text}</li>
                ))}
              </ul>
            </div>
          )}
          {view.dimensions && <DimensionsPanel d={view.dimensions} />}
          {view.perQuestion.length > 0 && (
            <div className="space-y-3">
              {view.perQuestion.map((c) => (
                <ResultCard key={`${c.questionId}-${c.provider}`} c={c} />
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Human review queue ({(view.reviewQueue ?? []).filter((i) => !i.done).length} open)</h3>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show done
              </label>
            </div>
            <div className="text-xs text-slate-500">
              Agreement on the 20% double-label sample ({view.agreement.ruleVersion}): mention {view.agreement.mentionAgreement.agree} of {view.agreement.mentionAgreement.of}, recommendation {view.agreement.recommendAgreement.agree} of {view.agreement.recommendAgreement.of} ({view.agreement.humanLabeled} of {view.agreement.sampled} sampled answers labeled).
            </div>
            {queue.map((i) => (
              <ReviewCard key={i.aiRunId} item={i} reviewer={reviewer} onSaved={load} />
            ))}
            {queue.length === 0 && <div className="text-sm text-slate-500">Nothing to review.</div>}
          </div>
        </>
      )}
    </Section>
  );
}
