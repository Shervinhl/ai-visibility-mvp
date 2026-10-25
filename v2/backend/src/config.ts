import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

/**
 * Effective configuration for v2.
 * Order of precedence: environment variable > config/checks.config.json.
 * The check version is the base version plus a hash of every value that changes check behaviour,
 * so a threshold change can never silently re-use an old version label (Core Rule 5).
 */

export interface CheckConfig {
  checkVersionBase: string;
  userAgent: string;
  robotsToken: string;
  aiCrawlers: string[];
  maxRequestsPerCheck: number;
  maxKeyPages: number;
  requestTimeoutMs: number;
  requestDelayMs: number;
  pageLoadAttempts: number;
  maxRedirectHops: number;
  robotsMaxRedirectHops: number;
  maxRetries: number;
  maxRetryAfterMs: number;
  renderWordThreshold: number;
  renderRawRatio: number;
  renderTimeoutMs: number;
  metaDescriptionMin: number;
  metaDescriptionMax: number;
  sitemapMaxDepth: number;
  sitemapMaxUrlsPerFile: number;
  sitemapMaxFiles: number;
  linkCrawlMaxDepth: number;
  trackingParams: string[];
}

export interface AiConfig {
  runsPerQuestion: number;
  timeoutMs: number;
  maxAttempts: number;
  maxRetryAfterMs: number;
  minValidRunsToReport: number;
  minAnswersForComparison: number;
  maxTokens: number;
  temperature: number;
  concurrencyPerProvider: number;
  models: { anthropic: string; openai: string; gemini: string };
  keys: { anthropic?: string; openai?: string; gemini?: string };
}

export interface AppConfig {
  port: number;
  dbPath: string;
  corsOrigin: string;
  checks: CheckConfig;
  ai: AiConfig;
}

const CONFIG_FILE = path.resolve(__dirname, "..", "config", "checks.config.json");
// When compiled, __dirname is dist/src; resolve the config from the package root either way.
function configFilePath(): string {
  const candidates = [CONFIG_FILE, path.resolve(__dirname, "..", "..", "config", "checks.config.json")];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error(`checks.config.json not found (looked in: ${candidates.join(", ")})`);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  return n;
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function envSecret(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

export function loadCheckConfig(overrides: Partial<CheckConfig> = {}): CheckConfig {
  const file = JSON.parse(readFileSync(configFilePath(), "utf8")) as CheckConfig & { note?: string };
  delete (file as { note?: string }).note;
  const merged: CheckConfig = {
    ...file,
    maxRequestsPerCheck: envNumber("V2_MAX_REQUESTS_PER_CHECK", file.maxRequestsPerCheck),
    maxKeyPages: envNumber("V2_MAX_KEY_PAGES", file.maxKeyPages),
    renderWordThreshold: envNumber("V2_RENDER_WORD_THRESHOLD", file.renderWordThreshold),
    renderRawRatio: envNumber("V2_RENDER_RAW_RATIO", file.renderRawRatio),
    requestDelayMs: envNumber("V2_REQUEST_DELAY_MS", file.requestDelayMs),
    ...overrides,
  };
  return merged;
}

/** Values that do not change what a check measures are excluded from the version hash. */
const NON_BEHAVIOURAL_KEYS: (keyof CheckConfig)[] = ["requestDelayMs", "checkVersionBase"];

export function checkVersion(cfg: CheckConfig): string {
  const behavioural: Record<string, unknown> = {};
  for (const key of Object.keys(cfg).sort() as (keyof CheckConfig)[]) {
    if (!NON_BEHAVIOURAL_KEYS.includes(key)) behavioural[key] = cfg[key];
  }
  const hash = createHash("sha256").update(JSON.stringify(behavioural)).digest("hex").slice(0, 8);
  return `${cfg.checkVersionBase}+cfg.${hash}`;
}

export function loadAiConfig(): AiConfig {
  return {
    runsPerQuestion: envNumber("V2_AI_RUNS_PER_QUESTION", 3),
    timeoutMs: envNumber("V2_AI_TIMEOUT_MS", 60000),
    maxAttempts: 3,
    maxRetryAfterMs: 60000,
    minValidRunsToReport: envNumber("V2_MIN_VALID_RUNS_TO_REPORT", 2),
    minAnswersForComparison: envNumber("V2_MIN_ANSWERS_FOR_COMPARISON", 10),
    maxTokens: envNumber("V2_AI_MAX_TOKENS", 1024),
    temperature: 0,
    concurrencyPerProvider: envNumber("V2_AI_CONCURRENCY", 2),
    models: {
      anthropic: envString("V2_ANTHROPIC_MODEL", "claude-sonnet-5-5"),
      openai: envString("V2_OPENAI_MODEL", "gpt-4.1"),
      gemini: envString("V2_GEMINI_MODEL", "gemini-2.5-flash"),
    },
    keys: {
      anthropic: envSecret("ANTHROPIC_API_KEY"),
      openai: envSecret("OPENAI_API_KEY"),
      gemini: envSecret("GEMINI_API_KEY"),
    },
  };
}

export function loadConfig(): AppConfig {
  return {
    port: envNumber("V2_PORT", 3000),
    dbPath: envString("V2_DB_PATH", path.resolve(process.cwd(), "data", "v2.sqlite")),
    corsOrigin: envString("V2_CORS_ORIGIN", "http://localhost:3001"),
    checks: loadCheckConfig(),
    ai: loadAiConfig(),
  };
}
