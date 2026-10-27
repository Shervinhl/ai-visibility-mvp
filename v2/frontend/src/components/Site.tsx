export type Page = "home" | "solutions" | "tool";

interface HeaderProps {
  page: Page;
  onNavigate: (p: Page) => void;
}

export function SiteHeader({ page, onNavigate }: HeaderProps) {
  const link = (p: Page, label: string) => (
    <button
      type="button"
      onClick={() => onNavigate(p)}
      aria-current={page === p ? "page" : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
        page === p ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-stone-200/70 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => onNavigate("home")} className="flex items-center gap-2" aria-label="Besignitics home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">B</span>
          <span className="text-base font-semibold tracking-tight text-slate-900">Besignitics</span>
        </button>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          {link("home", "Home")}
          {link("solutions", "Solutions")}
          {link("tool", "Visibility check")}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-3">
        <div>
          <p className="text-base font-semibold text-white">Besignitics</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
            Shows whether AI tools can read your business, what they say about it, and whether your changes make a difference.
          </p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-white">Product</p>
          <ul className="mt-3 space-y-2 text-slate-400">
            <li>Technical checks</li>
            <li>Business setup</li>
            <li>Question review</li>
            <li>AI answer tests</li>
            <li>Re-test comparison</li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-white">How we report</p>
          <ul className="mt-3 space-y-2 text-slate-400">
            <li>Each result stands on its own.</li>
            <li>Every finding gives a reason and a next step.</li>
            <li>Nothing is reduced to one number.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500">© Besignitics. AI Visibility Check, version 2.</p>
      </div>
    </footer>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</p>;
}

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700";
export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-stone-100";
