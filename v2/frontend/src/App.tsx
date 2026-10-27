import { useCallback, useEffect, useState } from "react";
import { api, Business, BusinessDetail, errorText } from "./api";
import { Notice } from "./components/ui";
import { Page, SiteFooter, SiteHeader } from "./components/Site";
import Home from "./screens/Home";
import Solutions from "./screens/Solutions";
import BusinessSetup from "./screens/BusinessSetup";
import TechnicalChecks from "./screens/TechnicalChecks";
import QuestionReview from "./screens/QuestionReview";
import AiResults from "./screens/AiResults";
import Retest from "./screens/Retest";

type Tab = "setup" | "checks" | "questions" | "ai" | "retest";
const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "1. Business setup" },
  { id: "checks", label: "2. Can AI read your site?" },
  { id: "questions", label: "3. Question review" },
  { id: "ai", label: "4. Does AI mention you?" },
  { id: "retest", label: "5. Re-test comparison" },
];

function readReviewer(): string {
  try {
    return localStorage.getItem("v2.reviewer") ?? "";
  } catch {
    return "";
  }
}

/** The page lives in the URL hash (#home, #solutions, #tool) so refresh and Back keep their place. */
function pageFromHash(): Page {
  const h = window.location.hash.replace(/^#/, "");
  return h === "solutions" || h === "tool" ? h : "home";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [tab, setTab] = useState<Tab>("setup");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [reviewer, setReviewer] = useState<string>(readReviewer());
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback((p: Page) => {
    window.location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const loadBusinesses = useCallback(async () => {
    try {
      const { data } = await api.get<{ businesses: Business[] }>("/businesses");
      setBusinesses(data.businesses);
      setError(null);
    } catch (e) {
      setError(`Backend not reachable: ${errorText(e)}`);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    try {
      const { data } = await api.get<BusinessDetail>(`/businesses/${selectedId}`);
      setDetail(data);
    } catch (e) {
      setError(errorText(e));
    }
  }, [selectedId]);

  useEffect(() => {
    void loadBusinesses();
  }, [loadBusinesses]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const saveReviewer = (v: string) => {
    setReviewer(v);
    try {
      localStorage.setItem("v2.reviewer", v);
    } catch {
      /* storage unavailable: keep in memory */
    }
  };

  const refresh = async () => {
    await loadBusinesses();
    await loadDetail();
  };

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <SiteHeader page={page} onNavigate={navigate} />

      {page === "home" && <Home onNavigate={navigate} />}
      {page === "solutions" && <Solutions onNavigate={navigate} />}

      {page === "tool" && (
        <div>
          <div className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">Visibility check</h1>
                <p className="text-xs text-slate-500">Each check and each AI result is shown on its own. No single number.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-56" value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value || null)}>
                  <option value="">New business…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input className="input w-44" placeholder="Your name (reviewer)" value={reviewer} onChange={(e) => saveReviewer(e.target.value)} />
              </div>
            </div>
            <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Steps">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
            {error && <Notice kind="error">{error}</Notice>}
            {tab !== "setup" && !detail && <Notice>Pick a business at the top, or create one in Business setup.</Notice>}
            {tab === "setup" && (
              <BusinessSetup
                detail={detail}
                reviewer={reviewer}
                onSaved={async (id) => {
                  await loadBusinesses();
                  setSelectedId(id);
                  await loadDetail();
                }}
              />
            )}
            {tab === "checks" && detail && <TechnicalChecks detail={detail} onChanged={refresh} />}
            {tab === "questions" && detail && <QuestionReview detail={detail} reviewer={reviewer} onChanged={refresh} />}
            {tab === "ai" && detail && <AiResults detail={detail} reviewer={reviewer} onChanged={refresh} />}
            {tab === "retest" && detail && <Retest detail={detail} reviewer={reviewer} onChanged={refresh} />}
          </main>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
