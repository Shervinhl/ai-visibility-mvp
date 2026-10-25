import { RawResponse, Transport, TransportNetworkError, TransportTimeout, FetcherDeps } from "../../src/checks/fetcher";
import { Renderer, RenderResult } from "../../src/checks/renderer";

export type FakeReply =
  | { status: number; headers?: Record<string, string>; body?: string | Buffer }
  | "timeout"
  | "network-error";

/** A route is either one reply (used every time) or a list (one per call; the last repeats). */
export type FakeRoute = FakeReply | FakeReply[];

export class FakeTransport implements Transport {
  readonly calls: string[] = [];
  private readonly counters = new Map<string, number>();

  constructor(private readonly routes: Record<string, FakeRoute>) {}

  async get(url: string): Promise<RawResponse> {
    this.calls.push(url);
    const route = this.routes[url];
    if (route === undefined) return { status: 404, headers: { "content-type": "text/html" }, body: Buffer.from("<html><body>Not found</body></html>") };
    let reply: FakeReply;
    if (Array.isArray(route)) {
      const n = this.counters.get(url) ?? 0;
      this.counters.set(url, n + 1);
      reply = route[Math.min(n, route.length - 1)];
    } else reply = route;
    if (reply === "timeout") throw new TransportTimeout("fake timeout");
    if (reply === "network-error") throw new TransportNetworkError("ECONNREFUSED: fake");
    const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8", ...(reply.headers ?? {}) };
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    return { status: reply.status, headers: lower, body: Buffer.isBuffer(reply.body) ? reply.body : Buffer.from(reply.body ?? "") };
  }
}

/** Deterministic dependencies: no waiting, fixed clock, fixed "random". */
export function fakeDeps(transport: Transport, start = "2026-10-25T12:00:00.000Z"): FetcherDeps {
  let t = Date.parse(start);
  return {
    transport,
    sleep: async () => undefined,
    now: () => {
      t += 1000;
      return new Date(t);
    },
    random: () => 0.5,
  };
}

/** Renderer that returns fixed HTML per URL, or reports itself as not installed. */
export class FakeRenderer implements Renderer {
  constructor(private readonly pages: Record<string, string | "timeout"> | "not-installed") {}
  async probe(): Promise<string | null> {
    return this.pages === "not-installed" ? "Playwright is not installed. Install it with: cd v2/backend && npm install playwright && npx playwright install chromium" : null;
  }
  async render(url: string): Promise<RenderResult> {
    if (this.pages === "not-installed") return { ok: false, kind: "NOT_INSTALLED", message: "not installed" };
    const html = this.pages[url];
    if (html === undefined) return { ok: false, kind: "ERROR", message: `no fixture for ${url}` };
    if (html === "timeout") return { ok: false, kind: "TIMEOUT", message: "Timeout 20000ms exceeded" };
    return { ok: true, html, finalUrl: url };
  }
  async close(): Promise<void> {}
}

export const html = (opts: { title?: string; h1?: string | string[]; description?: string; canonical?: string | string[]; body?: string; head?: string; jsonLd?: string[] }): string => {
  const h1s = opts.h1 === undefined ? [] : Array.isArray(opts.h1) ? opts.h1 : [opts.h1];
  const canon = opts.canonical === undefined ? [] : Array.isArray(opts.canonical) ? opts.canonical : [opts.canonical];
  return `<!doctype html><html><head>${opts.title !== undefined ? `<title>${opts.title}</title>` : ""}${
    opts.description !== undefined ? `<meta name="description" content="${opts.description}">` : ""
  }${canon.map((c) => `<link rel="canonical" href="${c}">`).join("")}${(opts.jsonLd ?? []).map((j) => `<script type="application/ld+json">${j}</script>`).join("")}${opts.head ?? ""}</head><body>${h1s
    .map((h) => `<h1>${h}</h1>`)
    .join("")}${opts.body ?? ""}</body></html>`;
};
