import React, { useState } from "react";
import axios from "axios";

interface Signal {
  signal_id: string;
  signal_name: string;
  weight: number;
  is_diagnostic: boolean;
  score: number | null;
  status: string;
  assessment: string;
  confidence: string;
  evidence_summary: any;
  explanation: string;
  recommendation: string;
}

interface AuditResult {
  success: boolean;
  data: {
    domain: string;
    audit_id: string;
    handbook_version: string;
    bands: Record<string, { min: number; max: number; label: string }>;
    engines: {
      engine1: {
        score: number;
        status: string;
        signals: Signal[];
        calculation: any;
      };
    };
    overallScore: number | null;
    coverage: {
      weight_assessed: number;
      weight_total: number;
      signals_implemented: number;
      signals_scored_total: number;
    };
    timestamp: string;
    framework_version: string;
  };
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  strong: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-900",
    badge: "bg-emerald-100 text-emerald-800",
  },
  moderate: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-900",
    badge: "bg-amber-100 text-amber-800",
  },
  weak: {
    bg: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-900",
    badge: "bg-orange-100 text-orange-800",
  },
  critical: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-900",
    badge: "bg-red-100 text-red-800",
  },
  unassessed: {
    bg: "bg-slate-50",
    border: "border-slate-300",
    text: "text-slate-900",
    badge: "bg-slate-100 text-slate-800",
  },
};

const getStatusColor = (status: string): (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS] => {
  const lower = status.toLowerCase();
  return STATUS_COLORS[lower] || STATUS_COLORS.unassessed;
};

export default function AuditApp() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [contentText, setContentText] = useState("");

  // One line per content unit: URL | text | optional weight
  const parseContentUnits = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        return { url: parts[0] || "", text: parts[1] || "", weight: parts[2] ? Number(parts[2]) : 1 };
      })
      .filter((u) => u.url.startsWith("http") && u.text.length > 0);

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    setProgress("Starting audit...");

    try {
      const start = await axios.post("http://localhost:3000/api/audit", {
        domain: domain.trim(),
        contentUnits: parseContentUnits(contentText),
      });

      if (!start.data.success) {
        throw new Error(start.data.error || "Audit failed to start");
      }

      const jobId = start.data.job_id;
      const startedAt = Date.now();
      setProgress(`Audit running. Rounds are one hour apart, so this takes about ${start.data.estimated_minutes} minutes. Keep the backend window open.`);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const poll = await axios.get(`http://localhost:3000/api/audit/${jobId}`);
        if (poll.data.status === "done") {
          setResult(poll.data);
          break;
        }
        if (poll.data.status === "failed" || poll.data.success === false) {
          throw new Error(poll.data.error || "Audit failed");
        }
        const mins = Math.floor((Date.now() - startedAt) / 60000);
        setProgress(`Audit running for ${mins} minute(s). Rounds are one hour apart, so this takes about ${start.data.estimated_minutes} minutes.`);
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        "Failed to complete audit. Check network and backend.";
      setError(errorMsg);
      console.error("Audit error:", err);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const statusColor = result ? getStatusColor(result.data.engines.engine1.status) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-white mb-3">Besignitics</h1>
          <p className="text-xl text-slate-300">Engine 1: AI Retrieval Accessibility</p>
          <p className="text-sm text-slate-400 mt-2">Handbook v1.0 • Framework 2.1</p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-xl shadow-2xl p-8 mb-8">
          <form onSubmit={handleAudit} className="space-y-6">
            <div>
              <label htmlFor="domain" className="block text-sm font-semibold text-slate-800 mb-3">
                Domain to Audit
              </label>
              <div className="flex gap-3">
                <input
                  id="domain"
                  type="text"
                  placeholder="example.com (or flowjin.com)"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-900 placeholder-slate-500"
                />
                <button
                  type="submit"
                  disabled={!domain.trim() || loading}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold rounded-lg transition duration-200 disabled:cursor-not-allowed shadow-lg"
                >
                  {loading ? "Auditing..." : "Start Audit"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="content" className="block text-sm font-semibold text-slate-800 mb-3">
                Key content for E1.09 (optional, one line per unit: URL | text | weight)
              </label>
              <textarea
                id="content"
                rows={6}
                placeholder={"https://example.com/ | Main headline text\nhttps://example.com/pricing | Plan name | 2"}
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-slate-100 text-slate-900 placeholder-slate-500 font-mono text-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                {parseContentUnits(contentText).length} valid unit(s) entered.
              </p>
            </div>
          </form>
        </div>

        {/* Progress Display */}
        {loading && progress && (
          <div className="bg-blue-900 border-2 border-blue-700 text-blue-100 px-6 py-4 rounded-lg mb-8 shadow-lg">
            <p>{progress}</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900 border-2 border-red-700 text-red-100 px-6 py-4 rounded-lg mb-8 shadow-lg">
            <p className="font-semibold mb-1">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* Results Section */}
        {result && statusColor && (
          <div className="space-y-8">
            {/* Overall Score Card */}
            <div className={`rounded-xl shadow-2xl p-8 border-2 ${statusColor.bg} ${statusColor.border}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-bold ${statusColor.text} mb-2`}>Engine 1 Score</p>
                  <h2 className={`text-4xl font-bold ${statusColor.text} mb-2`}>
                    {result.data.domain}
                  </h2>
                  <p className="text-slate-600 text-sm">Handbook v1.0 • 17 Oct 2026</p>
                </div>
                <div className="text-right">
                  <div className={`text-7xl font-black ${statusColor.text}`}>
                    {result.data.engines.engine1.score ?? "—"}
                  </div>
                  <div className={`text-2xl font-bold ${statusColor.badge} px-4 py-2 rounded-lg inline-block mt-2`}>
                    {result.data.engines.engine1.status}
                  </div>
                </div>
              </div>

              {/* Score Bands Reference */}
              <div className="mt-8 pt-8 border-t-2 border-current border-opacity-20">
                <p className={`text-sm font-bold ${statusColor.text} mb-4`}>Scoring Bands</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(result.data.bands).map(([key, band]) => {
                    const color = getStatusColor(band.label);
                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-lg ${color.bg} border border-current border-opacity-30`}
                      >
                        <p className={`font-bold text-sm ${color.text}`}>{band.label}</p>
                        <p className={`text-xs ${color.text} opacity-75`}>
                          {band.min}–{band.max}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {result.data.engines.engine1.status === "PARTIAL" && (
              <div className="bg-amber-50 border-2 border-amber-300 text-amber-900 px-6 py-4 rounded-lg">
                <p className="font-semibold mb-1">Partial result</p>
                <p>
                  {result.data.coverage.signals_implemented} of {result.data.coverage.signals_scored_total} scored
                  signals are assessed ({result.data.coverage.weight_assessed}% of total weight). The score is
                  provisional.
                </p>
              </div>
            )}

            {/* Calculation Breakdown */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Score Calculation</h3>
              <div className="space-y-4 bg-slate-50 p-6 rounded-lg">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Formula:</span>
                  <span className="text-slate-900 font-mono">
                    {result.data.engines.engine1.calculation.formula}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Scored Signals:</span>
                  <span className="text-slate-900 font-bold">
                    {result.data.engines.engine1.calculation.scored_signals}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Total Weight:</span>
                  <span className="text-slate-900 font-mono text-sm">
                    {result.data.engines.engine1.calculation.example}
                  </span>
                </div>
              </div>
            </div>

            {/* Signals */}
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">Signal Details</h3>
              <div className="space-y-6">
                {result.data.engines.engine1.signals.map((signal) => {
                  const signalColor = getStatusColor(signal.status);
                  return (
                    <div
                      key={signal.signal_id}
                      className={`bg-white rounded-xl shadow-lg p-8 border-l-4 border-blue-500 hover:shadow-xl transition`}
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h4 className="text-2xl font-bold text-slate-900">
                            {signal.signal_id}
                          </h4>
                          <p className="text-slate-600">{signal.signal_name}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-5xl font-black ${signalColor.text}`}>
                            {signal.score ?? "—"}
                          </div>
                          <div className={`text-sm font-bold ${signalColor.badge} px-3 py-1 rounded mt-2 inline-block`}>
                            {signal.status}</div><div className="text-xs text-slate-500 mt-1">{signal.assessment}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-slate-200">
                        <div>
                          <p className="text-slate-600 font-semibold text-sm">Weight</p>
                          <p className="text-lg font-bold text-slate-900">{signal.weight}%</p>
                        </div>
                        <div>
                          <p className="text-slate-600 font-semibold text-sm">Type</p>
                          <p className="text-lg font-bold text-slate-900">
                            {signal.is_diagnostic ? "Diagnostic" : "Scored"}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600 font-semibold text-sm">Confidence</p>
                          <p className="text-lg font-bold text-slate-900 capitalize">
                            {signal.confidence}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600 font-semibold text-sm">Evidence</p>
                          <p className="text-lg font-bold text-slate-900">
                            {signal.evidence_summary.evidence_tier || "—"}
                          </p>
                        </div>
                      </div>

                      {/* Evidence Summary */}
                      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="font-semibold text-sm text-blue-900 mb-3">Evidence Summary</p>
                        <div className="text-sm space-y-2">
                          {Object.entries(signal.evidence_summary).map(([key, value]) => (
                            <p key={key} className="text-blue-800">
                              <strong className="capitalize">{key.replace(/_/g, " ")}:</strong>{" "}
                              {String(value)}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Explanation and Recommendation */}
                      <div className="space-y-4">
                        <div>
                          <p className="font-semibold text-sm text-slate-700 mb-2">Explanation</p>
                          <p className="text-slate-600">{signal.explanation}</p>
                        </div>
                        {signal.recommendation && (
                          <div>
                            <p className="font-semibold text-sm text-slate-700 mb-2">Recommendation</p>
                            <p className="text-slate-600">{signal.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Audit Metadata */}
            <div className="bg-slate-700 rounded-xl p-6 text-sm text-slate-300">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-400 font-semibold">Audit ID</p>
                  <p className="font-mono text-xs text-slate-200">{result.data.audit_id}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold">Timestamp</p>
                  <p className="text-slate-200">
                    {new Date(result.data.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold">Framework</p>
                  <p className="text-slate-200">{result.data.framework_version}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !loading && !error && (
          <div className="text-center py-24 bg-white rounded-xl shadow-xl">
            <p className="text-slate-500 text-xl mb-2">Enter a domain to begin the audit</p>
            <p className="text-slate-400 text-sm">Tests: E1.01 (Crawl Access), E1.02 (Policy), E1.03 (Reliability)</p>
          </div>
        )}
      </div>
    </div>
  );
}
