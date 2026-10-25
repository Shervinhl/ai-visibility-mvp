import { ReactNode, useState } from "react";

const STATUS_STYLE: Record<string, string> = {
  PASS: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FAIL: "bg-rose-100 text-rose-800 border-rose-200",
  NOT_ASSESSED: "bg-amber-50 text-amber-800 border-amber-200",
  NOT_APPLICABLE: "bg-slate-100 text-slate-600 border-slate-200",
  MENTIONED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NOT_MENTIONED: "bg-slate-100 text-slate-700 border-slate-200",
  RECOMMENDED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NOT_RECOMMENDED: "bg-slate-100 text-slate-700 border-slate-200",
  CORRECT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  INCORRECT: "bg-rose-100 text-rose-800 border-rose-200",
  UNVERIFIABLE: "bg-slate-100 text-slate-700 border-slate-200",
  AMBIGUOUS: "bg-amber-50 text-amber-800 border-amber-200",
  REPORTED: "bg-sky-50 text-sky-800 border-sky-200",
  FROZEN: "bg-indigo-100 text-indigo-800 border-indigo-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANDIDATE: "bg-amber-50 text-amber-800 border-amber-200",
  REMOVED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  RUNNING: "bg-sky-50 text-sky-800 border-sky-200",
  DONE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ERROR: "bg-rose-100 text-rose-800 border-rose-200",
};

export function Badge({ status }: { status: string }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>{status}</span>;
}

export function Expand({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-900" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return <pre className="evidence">{JSON.stringify(value, null, 2)}</pre>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "warn"; children: ReactNode }) {
  const style = kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return <div className={`rounded-md border px-3 py-2 text-sm ${style}`}>{children}</div>;
}

export function Section({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
