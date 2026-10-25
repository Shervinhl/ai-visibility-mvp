import { useCallback, useEffect, useState } from "react";
import { api, BusinessDetail, CheckRunView, errorText, fmtDate } from "../api";
import { Badge, Expand, Json, Notice, Section } from "../components/ui";

export default function TechnicalChecks({ detail, onChanged }: { detail: BusinessDetail; onChanged: () => Promise<void> }) {
  const [runId, setRunId] = useState<string | null>(detail.checkRuns[0]?.id ?? null);
  const [view, setView] = useState<CheckRunView | null>(null);
  const [startInfo, setStartInfo] = useState<{ estimatedSeconds: number; warnings: string[]; plannedRequests: number; requestCap: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRunId(detail.checkRuns[0]?.id ?? null);
    setStartInfo(null);
    // reset only when a different business is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.business.id]);

  const load = useCallback(async () => {
    if (!runId) {
      setView(null);
      return;
    }
    try {
      const { data } = await api.get<CheckRunView>(`/checks/${runId}`);
      setView(data);
    } catch (e) {
      setError(errorText(e));
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view?.run.status !== "RUNNING") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [view?.run.status, load]);

  useEffect(() => {
    if (view && view.run.status !== "RUNNING") void onChanged();
    // refresh run list once a run finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.run.status]);

  const start = async () => {
    setError(null);
    try {
      const { data } = await api.post<{ runId: string; estimatedSeconds: number; warnings: string[]; plannedRequests: number; requestCap: number }>(`/businesses/${detail.business.id}/checks`);
      setStartInfo(data);
      setRunId(data.runId);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const meta = view?.run.meta as { notes?: string[]; keyPages?: string[]; keyPageSource?: string; requestsUsed?: number; requestCap?: number } | null | undefined;

  return (
    <Section
      title="Can AI read your site?"
      subtitle="12 technical checks on the homepage and key pages. GET requests only, robots.txt respected, request cap applied."
      actions={
        <div className="flex items-center gap-2">
          <select className="input w-64" value={runId ?? ""} onChange={(e) => setRunId(e.target.value || null)}>
            {detail.checkRuns.length === 0 && <option value="">No runs yet</option>}
            {detail.checkRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {fmtDate(r.startedAt)} · {r.status} · fact list v{r.factListVersion}
              </option>
            ))}
          </select>
          <button className="btn" onClick={start}>
            Run checks
          </button>
        </div>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      {startInfo && (
        <Notice>
          Started. Estimated time about {startInfo.estimatedSeconds} seconds ({startInfo.plannedRequests} planned requests, cap {startInfo.requestCap}).
          {startInfo.warnings.map((w) => (
            <span key={w} className="mt-1 block text-amber-800">
              {w}
            </span>
          ))}
        </Notice>
      )}
      {view?.run.status === "RUNNING" && <Notice>Checking… this page refreshes every few seconds.</Notice>}
      {view?.run.status === "ERROR" && <Notice kind="error">The run stopped: {view.run.error}</Notice>}
      {view && view.run.status === "DONE" && (
        <>
          <div className="card text-sm text-slate-600">
            <div>
              Check version <code>{view.run.checkVersion}</code> · fact list v{view.run.factListVersion} · finished {fmtDate(view.run.finishedAt)} · {meta?.requestsUsed} of {meta?.requestCap} requests used
            </div>
            <div>
              Key pages ({meta?.keyPageSource}): {(meta?.keyPages ?? []).length}
            </div>
            {(meta?.notes ?? []).map((n) => (
              <div key={n} className="text-amber-800">
                {n}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {view.results.map((r) => (
              <div key={r.checkId} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-400">{r.checkId}</div>
                    <div className="font-semibold">{r.name}</div>
                  </div>
                  <Badge status={r.status} />
                </div>
                <p className="text-sm">{r.finding.headline}</p>
                {r.status !== "PASS" && r.nextStep && <p className="text-sm text-slate-700">
                  <span className="font-semibold">Next step:</span> {r.nextStep}
                </p>}
                <Expand label="What we checked and why it matters">
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>
                      <b>What was checked:</b> {r.finding.whatChecked}
                    </p>
                    <p>
                      <b>Why it matters:</b> {r.finding.whyItMatters}
                    </p>
                    <p>
                      <b>What to change:</b> {r.finding.whatToChange}
                    </p>
                    <p>
                      <b>How to re-test:</b> {r.finding.howToRetest}
                    </p>
                  </div>
                </Expand>
                {r.pages.length > 0 && (
                  <Expand label={`Per page (${r.pages.length})`}>
                    <table className="w-full text-left text-xs">
                      <tbody>
                        {r.pages.map((p) => (
                          <tr key={p.pageUrl} className="border-t border-slate-100 align-top">
                            <td className="py-1 pr-2">
                              <Badge status={p.status} />
                            </td>
                            <td className="break-all py-1 pr-2 font-mono">{p.pageUrl}</td>
                            <td className="py-1">
                              {p.reason}
                              {p.nextStep && p.status !== "PASS" && <div className="text-slate-500">Next: {p.nextStep}</div>}
                              <Expand label="evidence">
                                <Json value={p.evidence} />
                              </Expand>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Expand>
                )}
                <Expand label="Evidence (site level)">
                  <Json value={r.evidence} />
                </Expand>
              </div>
            ))}
          </div>
        </>
      )}
      {!view && <Notice>No check run yet. Press “Run checks”.</Notice>}
    </Section>
  );
}
