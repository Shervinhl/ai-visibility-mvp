import { useEffect, useState } from "react";
import { api, BusinessDetail, Comparison, errorText, fmtDate, Overall } from "../api";
import { Notice, Section } from "../components/ui";

function Side({ title, o }: { title: string; o: Overall }) {
  return (
    <div className="flex-1 rounded-md border border-slate-200 p-3 text-sm">
      <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{title}</div>
      <div>{o.mentioned.text}</div>
      <div>{o.recommended.text}</div>
      {o.mentioned.note && <div className="text-xs text-amber-800">{o.mentioned.note}</div>}
    </div>
  );
}

export default function Retest({ detail, reviewer, onChanged }: { detail: BusinessDetail; reviewer: string; onChanged: () => Promise<void> }) {
  const done = detail.aiRuns.filter((r) => r.status === "DONE");
  const setVersion = (setId: string) => detail.questionSets.find((s) => s.id === setId)?.version ?? "draft";
  const [before, setBefore] = useState<string>("");
  const [after, setAfter] = useState<string>("");
  const [description, setDescription] = useState("");
  const [changedAt, setChangedAt] = useState(new Date().toISOString().slice(0, 10));
  const [eventId, setEventId] = useState<string | null>(detail.changeEvents[0]?.id ?? null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    setEventId(detail.changeEvents[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.business.id]);

  useEffect(() => {
    if (!eventId) {
      setComparison(null);
      return;
    }
    api
      .get<{ comparison: Comparison }>(`/change-events/${eventId}`)
      .then(({ data }) => setComparison(data.comparison))
      .catch((e) => setMsg({ kind: "error", text: errorText(e) }));
  }, [eventId]);

  const beforeRun = done.find((r) => r.id === before);
  const sameSetRuns = beforeRun ? done.filter((r) => r.questionSetId === beforeRun.questionSetId && r.id !== before) : [];

  const save = async () => {
    setMsg(null);
    try {
      const { data } = await api.post<{ changeEvent: { id: string }; comparison: Comparison }>("/change-events", {
        businessId: detail.business.id,
        description,
        changedAt: new Date(changedAt).toISOString(),
        beforeRunIds: [before],
        afterRunIds: [after],
        createdBy: reviewer,
      });
      setComparison(data.comparison);
      setEventId(data.changeEvent.id);
      await onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  return (
    <Section title="Re-test comparison" subtitle="Before and after a change, on the same frozen question set with the same providers and settings. Comparisons across versions are blocked.">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="card space-y-3">
        <h3 className="font-semibold">Log a change and compare</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">Run before the change</span>
            <select className="input" value={before} onChange={(e) => { setBefore(e.target.value); setAfter(""); }}>
              <option value="">Pick a finished run</option>
              {done.map((r) => (
                <option key={r.id} value={r.id}>
                  {setVersion(r.questionSetId)} · {fmtDate(r.startedAt)} · {r.providers.join(", ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Run after the change (same question-set version)</span>
            <select className="input" value={after} onChange={(e) => setAfter(e.target.value)} disabled={!before}>
              <option value="">Pick a finished run</option>
              {sameSetRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {setVersion(r.questionSetId)} · {fmtDate(r.startedAt)} · {r.providers.join(", ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">What was changed</span>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Added prices to the pricing page HTML and fixed the about page canonical tag" />
          </label>
          <label className="block">
            <span className="label">Date of the change</span>
            <input type="date" className="input" value={changedAt} onChange={(e) => setChangedAt(e.target.value)} />
          </label>
        </div>
        <button className="btn" disabled={!before || !after || !description.trim()} onClick={save}>
          Save change and compare
        </button>
      </div>

      {detail.changeEvents.length > 0 && (
        <select className="input w-full md:w-96" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value || null)}>
          {detail.changeEvents.map((c) => (
            <option key={c.id} value={c.id}>
              {fmtDate(c.changedAt)} · {c.description.slice(0, 60)}
            </option>
          ))}
        </select>
      )}

      {comparison && (
        <div className="card space-y-3">
          <div className="text-sm text-slate-600">
            Question set {comparison.questionSetVersion} · change on {fmtDate(comparison.changedAt)}: <b>{comparison.changeDescription}</b>
          </div>
          <p className="text-sm font-medium">{comparison.overall.statement}</p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Side title="Before" o={comparison.overall.before} />
            <Side title="After" o={comparison.overall.after} />
          </div>
          {comparison.perProvider.map((p) => (
            <div key={p.provider} className="space-y-1">
              <div className="text-xs font-semibold uppercase text-slate-400">{p.provider}</div>
              <div className="flex flex-col gap-2 md:flex-row">
                <Side title="Before" o={p.before} />
                <Side title="After" o={p.after} />
              </div>
            </div>
          ))}
          <table className="w-full text-left text-xs">
            <thead className="uppercase text-slate-400">
              <tr>
                <th>Question</th>
                <th>Provider</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {comparison.perQuestion.map((q) => (
                <tr key={`${q.questionId}-${q.provider}`} className="border-t border-slate-100 align-top">
                  <td className="py-1 pr-2">{q.questionText}</td>
                  <td className="py-1 pr-2">{q.provider}</td>
                  <td className="py-1 pr-2">{q.before}</td>
                  <td className="py-1">{q.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">{comparison.caveat}</p>
        </div>
      )}
    </Section>
  );
}
