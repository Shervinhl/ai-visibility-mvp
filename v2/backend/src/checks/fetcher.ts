import axios from "axios";
import { gunzipSync } from "zlib";
import { CheckConfig } from "../config";
import { HttpObservation } from "./types";
import { isAllowed, parseRobots, ParsedRobots } from "./robots";
import { originOf, robotsPath } from "./url";

/** One raw GET with no redirect following. Implemented over HTTP in production and by fixtures in tests. */
export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export class TransportTimeout extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "TransportTimeout";
  }
}

export class TransportNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportNetworkError";
  }
}

export interface Transport {
  get(url: string, userAgent: string, timeoutMs: number): Promise<RawResponse>;
}

/** Production transport: GET only, no redirects followed by axios (we follow them ourselves). */
export class HttpTransport implements Transport {
  async get(url: string, userAgent: string, timeoutMs: number): Promise<RawResponse> {
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        timeout: timeoutMs,
        maxRedirects: 0,
        responseType: "arraybuffer",
        validateStatus: () => true,
        decompress: true,
        maxContentLength: 15 * 1024 * 1024,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        },
      });
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers ?? {})) {
        if (v === undefined || v === null) continue;
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
      }
      return { status: res.status, headers, body: Buffer.from(res.data ?? new ArrayBuffer(0)) };
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT" || /timeout/i.test(e.message ?? "")) {
        throw new TransportTimeout(e.message ?? "timeout");
      }
      throw new TransportNetworkError(`${e.code ?? "ERROR"}: ${e.message ?? "network error"}`);
    }
  }
}

export interface FetcherDeps {
  transport: Transport;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  random: () => number;
}

export const realDeps = (): FetcherDeps => ({
  transport: new HttpTransport(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date(),
  random: Math.random,
});

export type RobotsState =
  | { kind: "PARSED"; parsed: ParsedRobots; observation: HttpObservation; text: string }
  | { kind: "NO_RULES"; observation: HttpObservation; status: number }
  | { kind: "UNAVAILABLE"; observation: HttpObservation; reason: string };

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | undefined, now: Date): number | null {
  if (!value) return null;
  const secs = Number(value.trim());
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - now.getTime());
  return null;
}

function decodeBody(buf: Buffer): string {
  let b = buf;
  if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) {
    try {
      b = gunzipSync(b);
    } catch {
      /* leave as-is */
    }
  }
  return b.toString("utf8");
}

/**
 * Polite fetcher for one check run. Enforces:
 * - a hard request budget (every HTTP request, retry and redirect hop counts),
 * - robots.txt for our own user-agent on every fetch (RFC 9309: unreachable robots.txt = disallow all),
 * - GET only, a fixed descriptive user-agent, a delay between requests,
 * - retries for timeouts and 429 only, exponential backoff with jitter, Retry-After respected.
 */
export class PoliteFetcher {
  private used = 0;
  private readonly robotsByOrigin = new Map<string, RobotsState>();
  private readonly cache = new Map<string, HttpObservation>();
  readonly log: { url: string; status: number | null; at: string; purpose: string }[] = [];

  constructor(private readonly cfg: CheckConfig, private readonly deps: FetcherDeps) {}

  get requestsUsed(): number {
    return this.used;
  }

  get budgetRemaining(): number {
    return Math.max(0, this.cfg.maxRequestsPerCheck - this.used);
  }

  robotsStateFor(origin: string): RobotsState | undefined {
    return this.robotsByOrigin.get(origin);
  }

  /** Fetches and parses robots.txt for an origin once. */
  async loadRobots(origin: string): Promise<RobotsState> {
    const existing = this.robotsByOrigin.get(origin);
    if (existing) return existing;
    const obs = await this.request(`${origin}/robots.txt`, this.cfg.robotsMaxRedirectHops, "robots", false);
    let state: RobotsState;
    if (obs.outcome !== "OK" || obs.status === null) {
      state = { kind: "UNAVAILABLE", observation: obs, reason: `robots.txt could not be fetched (${obs.outcome}${obs.error ? ": " + obs.error : ""})` };
    } else if (obs.status >= 200 && obs.status < 300) {
      state = { kind: "PARSED", parsed: parseRobots(obs.body), observation: obs, text: obs.body };
    } else if (obs.status === 429) {
      state = { kind: "UNAVAILABLE", observation: obs, reason: "robots.txt kept returning 429 Too Many Requests" };
    } else if (obs.status >= 400 && obs.status < 500) {
      state = { kind: "NO_RULES", observation: obs, status: obs.status };
    } else {
      state = { kind: "UNAVAILABLE", observation: obs, reason: `robots.txt returned HTTP ${obs.status}` };
    }
    this.robotsByOrigin.set(origin, state);
    return state;
  }

  /** Is our own checker allowed to fetch this URL? Loads that origin's robots.txt if needed. */
  async mayFetch(url: string): Promise<{ allowed: boolean; reason: string }> {
    const origin = originOf(url);
    const state = await this.loadRobots(origin);
    if (state.kind === "UNAVAILABLE") {
      return { allowed: false, reason: `${state.reason}. RFC 9309 says to treat this as "disallow all", so the page was not fetched.` };
    }
    if (state.kind === "NO_RULES") return { allowed: true, reason: `robots.txt returned HTTP ${state.status}: no rules` };
    const d = isAllowed(state.parsed, this.cfg.robotsToken, robotsPath(url));
    return d.allowed
      ? { allowed: true, reason: "allowed by robots.txt" }
      : { allowed: false, reason: `robots.txt disallows ${this.cfg.robotsToken} for this path (line ${d.rule?.line}: "${d.rule?.allow ? "Allow" : "Disallow"}: ${d.rule?.pattern}")` };
  }

  /**
   * GET a page respecting robots.txt, following up to maxHops redirects.
   * cacheKey lets independent checks reuse the first fetch of a page without spending budget again.
   */
  async fetchPage(url: string, purpose: string, opts: { maxHops?: number; useCache?: boolean } = {}): Promise<HttpObservation> {
    const useCache = opts.useCache ?? true;
    if (useCache && this.cache.has(url)) return this.cache.get(url)!;
    const obs = await this.request(url, opts.maxHops ?? this.cfg.maxRedirectHops, purpose, true);
    if (useCache) this.cache.set(url, obs);
    return obs;
  }

  cached(url: string): HttpObservation | undefined {
    return this.cache.get(url);
  }

  /** A browser render is one page load: it must pass robots.txt and spend one unit of budget. */
  async reserveRender(url: string): Promise<{ ok: boolean; reason: string }> {
    const permission = await this.mayFetch(url);
    if (!permission.allowed) return { ok: false, reason: permission.reason };
    if (this.used > 0 && this.cfg.requestDelayMs > 0) await this.deps.sleep(this.cfg.requestDelayMs);
    if (!this.spend()) return { ok: false, reason: `request cap of ${this.cfg.maxRequestsPerCheck} reached before this page could be rendered` };
    this.log.push({ url, status: null, at: this.deps.now().toISOString(), purpose: "render" });
    return { ok: true, reason: "" };
  }

  private blank(url: string, outcome: HttpObservation["outcome"], error: string, requestsUsed = 0, retries = 0): HttpObservation {
    return {
      requestedUrl: url,
      finalUrl: url,
      status: null,
      headers: {},
      body: "",
      bytes: 0,
      contentType: "",
      redirectChain: [],
      outcome,
      error,
      requestsUsed,
      retries,
      fetchedAt: this.deps.now().toISOString(),
    };
  }

  /** Spends one unit of budget. Returns false when the budget is exhausted. */
  private spend(): boolean {
    if (this.used >= this.cfg.maxRequestsPerCheck) return false;
    this.used += 1;
    return true;
  }

  private async request(url: string, maxHops: number, purpose: string, respectRobots: boolean): Promise<HttpObservation> {
    const chain: { url: string; status: number }[] = [];
    const seen = new Set<string>();
    let current = url;
    let requestsUsed = 0;
    let retries = 0;
    for (let hop = 0; hop <= maxHops; hop++) {
      if (respectRobots) {
        const permission = await this.mayFetch(current);
        if (!permission.allowed) {
          const o = this.blank(url, "ROBOTS_BLOCKED", permission.reason, requestsUsed, retries);
          o.finalUrl = current;
          o.redirectChain = chain;
          return o;
        }
      }
      if (seen.has(current)) {
        const o = this.blank(url, "REDIRECT_LOOP", `redirect loop at ${current}`, requestsUsed, retries);
        o.redirectChain = chain;
        o.finalUrl = current;
        return o;
      }
      seen.add(current);
      // Retry loop for timeouts and 429 only.
      let res: RawResponse | null = null;
      let lastError = "";
      let timedOut = false;
      for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
        if (this.used > 0 && this.cfg.requestDelayMs > 0) await this.deps.sleep(this.cfg.requestDelayMs);
        if (!this.spend()) {
          const o = this.blank(url, "BUDGET_EXHAUSTED", `request cap of ${this.cfg.maxRequestsPerCheck} reached`, requestsUsed, retries);
          o.redirectChain = chain;
          return o;
        }
        requestsUsed += 1;
        try {
          res = await this.deps.transport.get(current, this.cfg.userAgent, this.cfg.requestTimeoutMs);
          this.log.push({ url: current, status: res.status, at: this.deps.now().toISOString(), purpose });
          timedOut = false;
        } catch (err) {
          this.log.push({ url: current, status: null, at: this.deps.now().toISOString(), purpose });
          res = null;
          timedOut = err instanceof TransportTimeout;
          lastError = (err as Error).message;
          if (!timedOut) {
            const o = this.blank(url, "NETWORK_ERROR", lastError, requestsUsed, retries);
            o.redirectChain = chain;
            return o;
          }
        }
        const retryable = timedOut || (res !== null && res.status === 429);
        if (!retryable || attempt === this.cfg.maxRetries) break;
        retries += 1;
        const retryAfter = res ? parseRetryAfter(res.headers["retry-after"], this.deps.now()) : null;
        const backoff = 1000 * 2 ** attempt + Math.floor(this.deps.random() * 250);
        await this.deps.sleep(Math.min(retryAfter ?? backoff, this.cfg.maxRetryAfterMs));
      }
      if (res === null) {
        const o = this.blank(url, "TIMEOUT", lastError || "timeout", requestsUsed, retries);
        o.redirectChain = chain;
        o.finalUrl = current;
        return o;
      }
      const location = res.headers["location"];
      if (res.status >= 300 && res.status < 400 && location) {
        chain.push({ url: current, status: res.status });
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          const o = this.blank(url, "NETWORK_ERROR", `invalid Location header "${location}"`, requestsUsed, retries);
          o.redirectChain = chain;
          return o;
        }
        current = next;
        continue;
      }
      const body = decodeBody(res.body);
      return {
        requestedUrl: url,
        finalUrl: current,
        status: res.status,
        headers: res.headers,
        body,
        bytes: res.body.length,
        contentType: (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(),
        redirectChain: chain,
        outcome: "OK",
        requestsUsed,
        retries,
        fetchedAt: this.deps.now().toISOString(),
      };
    }
    const o = this.blank(url, "TOO_MANY_REDIRECTS", `more than ${maxHops} redirect hops`, requestsUsed, retries);
    o.redirectChain = chain;
    o.finalUrl = current;
    return o;
  }
}
