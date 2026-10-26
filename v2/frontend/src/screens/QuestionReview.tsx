import { useCallback, useEffect, useState, useRef } from "react";
import { api, BusinessDetail, errorText, fmtDate, Question, QuestionSetView, QuestionType, QUESTION_TYPES } from "../api";
import { Badge, Expand, Notice, Section } from "../components/ui";

interface GenInfo {
  templateVersion: string;
  generator: { provider: string; model: string } | null;
  mix: { total: number; byType: Record<string, number>; byGroup: Record<string, number>; note: string };
  removed: { text: string; source: string; reason: string }[];
  warnings: string[];
}

function QuestionRow({ q, frozen, onAction }: { q: Question; frozen: boolean; onAction: (action: "approve" | "remove" | "edit", text?: string, type?: QuestionType) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [type, setType] = useState<QuestionType>(q.type);
  useEffect(() => {
    setText(q.text);
    setType(q.type);
  }, [q.text, q.type]);
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-2 text-xs text-slate-400">{q.position}</td>
      <td className="py-2 pr-2">
        {editing ? (
          <div className="space-y-1">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
            <select className="input w-40" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className={q.status === "REMOVED" ? "text-slate-400 line-through" : ""}>{q.text}</div>
        )}
        <div className="mt-0.5 text-[11px] text-slate-400">
          {q.type} · source {q.source}
          {q.approvedBy ? ` · approved by ${q.approvedBy}` : ""}
          {q.editedBy && q.originalText !== q.text ? ` · edited (was: “${q.originalText}”)` : ""}
        </div>
      </td>
      <td className="py-2 pr-2">
        <Badge status={q.status} />
      </td>
      <td className="whitespace-nowrap py-2 text-right">
        {editing ? (
          <>
            <button
              className="btn"
              onClick={async () => {
                await onAction("edit", text, type);
                setEditing(false);
              }}
            >
              Save
            </button>{" "}
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {q.status !== "APPROVED" && (
              <button className="btn-ghost" onClick={() => onAction("approve")}>
                Approve
              </button>
            )}{" "}
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>{" "}
            {q.status !== "REMOVED" && (
              <button className="btn-ghost" onClick={() => onAction("remove")}>
                Remove
              </button>
            )}
          </>
        )}
        {frozen && <div className="mt-1 text-[11px] text-slate-400">Changes create a new version</div>}
      </td>
    </tr>
  );
}

export default function QuestionReview({ detail, reviewer, onChanged }: { detail: BusinessDetail; reviewer: string; onChanged: () => Promise<void> }) {
  const [setId, setSetId] = useState<string | null>(detail.questionSets[0]?.id ?? null);
  const [view, setView] = useState<QuestionSetView | null>(null);
  const [gen, setGen] = useState<GenInfo | null>(null);
  const [customerQuestions, setCustomerQuestions] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [gscCsv, setGscCsv] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newType, setNewType] = useState<QuestionType>("RECOMMEND");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error" | "warn"; text: string } | null>(null);

  useEffect(() => {
    setSetId(detail.questionSets[0]?.id ?? null);
    setGen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.business.id]);

  const load = useCallback(async () => {
    if (!setId) {
      setView(null);
      return;
    }
    try {
      const { data } = await api.get<QuestionSetView>(`/question-sets/${setId}`);
      setView(data);
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  }, [setId]);

  useEffect(() => {
    void load();
  }, [load]);

  // First visit for a business with no question set: generate candidates from its fact list automatically.
  const autoTried = useRef(false);
  useEffect(() => {
    if (!setId && !autoTried.current && !busy) {
      autoTried.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  const needReviewer = () => {
    if (reviewer.trim().length < 2) {
      setMsg({ kind: "error", text: "Enter your name at the top. Every approval, edit and freeze records the reviewer and time." });
      return true;
    }
    return false;
  };

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post<{ questionSet: QuestionSetView; generation: GenInfo }>(`/businesses/${detail.business.id}/question-sets/generate`, {
        customerQuestions,
        searchSuggestions: suggestions,
        ...(gscCsv ? { gscCsv } : {}),
      });
      setGen(data.generation);
      setSetId(data.questionSet.set.id);
      setView(data.questionSet);
      await onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const act = async (q: Question, action: "approve" | "remove" | "edit", text?: string, type?: QuestionType) => {
    if (needReviewer() || !view) return;
    try {
      const { data } = await api.patch<{ questionSetId: string; createdNewSet: boolean; message: string | null; questionSet: QuestionSetView }>(`/question-sets/${view.set.id}/questions/${q.id}`, { action, text, type, reviewer });
      if (data.createdNewSet) {
        setMsg({ kind: "warn", text: data.message ?? "A new draft set was created." });
        setSetId(data.questionSetId);
        await onChanged();
      }
      setView(data.questionSet);
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const approveAll = async () => {
    if (needReviewer() || !view) return;
    for (const q of view.questions.filter((x) => x.status === "CANDIDATE")) {
      await api.patch(`/question-sets/${view.set.id}/questions/${q.id}`, { action: "approve", reviewer });
    }
    await load();
  };

  const add = async () => {
    if (needReviewer() || !view || !newText.trim()) return;
    try {
      const { data } = await api.post<{ questionSetId: string; createdNewSet: boolean; questionSet: QuestionSetView }>(`/question-sets/${view.set.id}/questions`, { text: newText, type: newType, reviewer });
      if (data.createdNewSet) {
        setMsg({ kind: "warn", text: "The set was frozen, so the question was added to a new draft set." });
        setSetId(data.questionSetId);
        await onChanged();
      }
      setView(data.questionSet);
      setNewText("");
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const freeze = async () => {
    if (needReviewer() || !view) return;
    try {
      await api.post(`/question-sets/${view.set.id}/freeze`, { reviewer });
      setMsg({ kind: "info", text: "Frozen. This version can no longer be edited; any change creates the next version." });
      await load();
      await onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const frozen = view?.set.status === "FROZEN";

  return (
    <Section
      title="Question review"
      subtitle="Generate 30 to 40 candidate buyer questions, approve 20 to 40, then freeze them as a version."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-72" value={setId ?? ""} onChange={(e) => setSetId(e.target.value || null)}>
            {detail.questionSets.length === 0 && <option value="">No question sets yet</option>}
            {detail.questionSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.version ?? "draft"} · {s.status} · {fmtDate(s.createdAt)}
              </option>
            ))}
          </select>
          <button className="btn" disabled={busy} onClick={generate}>
            {busy ? "Generating…" : "Generate questions with AI"}
          </button>
        </div>
      }
    >
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="card space-y-3">
        <h3 className="font-semibold">Generate candidates</h3>
        <p className="text-sm text-slate-500">Uses the fixed question template and your fact list. Questions that name your business are removed automatically.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="label">Customer questions (sales calls, support)</span>
            <textarea className="input text-xs" rows={4} value={customerQuestions} onChange={(e) => setCustomerQuestions(e.target.value)} placeholder="One per line" />
          </label>
          <label className="block">
            <span className="label">Search suggestions (approved source)</span>
            <textarea className="input text-xs" rows={4} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} placeholder="One per line" />
          </label>
          <label className="block">
            <span className="label">Google Search Console export (CSV)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setGscCsv(f ? await f.text() : null);
              }}
            />
            {gscCsv && <span className="mt-1 block text-xs text-slate-500">CSV loaded ({gscCsv.split("\n").length} lines)</span>}
          </label>
        </div>
        <button className="btn" disabled={busy} onClick={generate}>
          {busy ? "Generating…" : "Generate candidate questions"}
        </button>
        {gen && (
          <div className="space-y-1 text-sm">
            {gen.warnings.map((w) => (
              <Notice key={w} kind="warn">
                {w}
              </Notice>
            ))}
            <div>
              Template {gen.templateVersion} · {gen.generator ? `${gen.generator.provider} (${gen.generator.model})` : "no AI generator"} · {gen.mix.total} candidates · RECOMMEND {gen.mix.byGroup.RECOMMEND}, COMPARE/PRICE {gen.mix.byGroup.COMPARE_OR_PRICE}, HOWTO/PROBLEM {gen.mix.byGroup.HOWTO_OR_PROBLEM}. {gen.mix.note}
            </div>
            {gen.removed.length > 0 && (
              <Expand label={`${gen.removed.length} removed`}>
                <ul className="list-disc pl-5 text-xs text-slate-600">
                  {gen.removed.map((r, i) => (
                    <li key={i}>
                      “{r.text}” ({r.source}): {r.reason}
                    </li>
                  ))}
                </ul>
              </Expand>
            )}
          </div>
        )}
      </div>

      {view && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge status={view.set.status} />
              <span className="font-semibold">{view.set.version ?? "Draft set"}</span>
              <span className="text-sm text-slate-500">
                {view.counts.APPROVED} approved · {view.counts.CANDIDATE} candidate · {view.counts.REMOVED} removed
                {view.set.frozenAt ? ` · frozen by ${view.set.frozenBy} on ${fmtDate(view.set.frozenAt)}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              {!frozen && (
                <button className="btn-ghost" onClick={approveAll} disabled={view.counts.CANDIDATE === 0}>
                  Approve all candidates
                </button>
              )}
              <button className="btn" onClick={freeze} disabled={frozen || view.counts.APPROVED < 20 || view.counts.APPROVED > 40}>
                Freeze ({view.counts.APPROVED}/20–40)
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Approved mix: RECOMMEND {view.approvedMix.byGroup.RECOMMEND} · COMPARE/PRICE {view.approvedMix.byGroup.COMPARE_OR_PRICE} · HOWTO/PROBLEM {view.approvedMix.byGroup.HOWTO_OR_PROBLEM}. {view.approvedMix.note}
          </div>
          {frozen && <Notice>This set is frozen. Editing, removing or adding creates a new draft set; results already collected stay linked to {view.set.version}.</Notice>}
          <table className="w-full text-left text-sm">
            <tbody>
              {view.questions.map((q) => (
                <QuestionRow key={q.id} q={q} frozen={frozen} onAction={(a, t, ty) => act(q, a, t, ty)} />
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <input className="input flex-1" placeholder="Add a question" value={newText} onChange={(e) => setNewText(e.target.value)} />
            <select className="input w-40" value={newType} onChange={(e) => setNewType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button className="btn" onClick={add}>
              Add
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
