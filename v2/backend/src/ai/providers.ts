import axios, { AxiosError } from "axios";
import { AiConfig } from "../config";
import { TextGenerator } from "../questions/generate";

/**
 * Part C1: official provider APIs only (Anthropic Messages, OpenAI Chat Completions, Gemini generateContent).
 * Keys come from environment variables only. Every run stores the exact settings that were sent.
 */

export type ProviderName = "anthropic" | "openai" | "gemini" | `fake-${string}`;

export interface ProviderSettings {
  provider: ProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: null;
  tools: [];
  endpoint: string;
  apiVersion: string | null;
}

export interface ProviderReply {
  text: string;
  /** Provider-specific stop reason, e.g. "end_turn", "stop", "SAFETY". */
  finishReason: string | null;
  /** True when the provider itself reports a refusal or a safety block. */
  providerRefusal: boolean;
  /** Full raw response body as returned by the API. */
  raw: string;
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number, readonly body: string, readonly retryAfter: string | undefined) {
    super(`HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

export class ProviderTimeoutError extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export interface AiProvider {
  readonly name: ProviderName;
  readonly model: string;
  readonly settings: ProviderSettings;
  ask(question: string, timeoutMs: number): Promise<ProviderReply>;
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<string> {
  try {
    const res = await axios.post(url, body, {
      headers: { "content-type": "application/json", ...headers },
      timeout: timeoutMs,
      responseType: "text",
      transformResponse: (d) => d,
      validateStatus: () => true,
    });
    const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    if (res.status < 200 || res.status >= 300) {
      const ra = res.headers?.["retry-after"];
      throw new ProviderHttpError(res.status, text, ra === undefined ? undefined : String(ra));
    }
    return text;
  } catch (err) {
    if (err instanceof ProviderHttpError) throw err;
    const e = err as AxiosError;
    if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT" || /timeout/i.test(e.message ?? "")) throw new ProviderTimeoutError(e.message);
    // Network failures are treated like a 503 so they follow the retry rule for server errors.
    throw new ProviderHttpError(503, `network error: ${e.code ?? ""} ${e.message ?? ""}`.trim(), undefined);
  }
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  readonly settings: ProviderSettings;
  constructor(private readonly apiKey: string, readonly model: string, cfg: Pick<AiConfig, "temperature" | "maxTokens">) {
    this.settings = { provider: "anthropic", model, temperature: cfg.temperature, maxTokens: cfg.maxTokens, systemPrompt: null, tools: [], endpoint: "https://api.anthropic.com/v1/messages", apiVersion: "2023-06-01" };
  }
  async ask(question: string, timeoutMs: number): Promise<ProviderReply> {
    const raw = await post(
      this.settings.endpoint,
      { "x-api-key": this.apiKey, "anthropic-version": this.settings.apiVersion! },
      { model: this.model, max_tokens: this.settings.maxTokens, temperature: this.settings.temperature, messages: [{ role: "user", content: question }] },
      timeoutMs
    );
    const j = JSON.parse(raw) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    return { text, finishReason: j.stop_reason ?? null, providerRefusal: j.stop_reason === "refusal", raw };
  }
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;
  readonly settings: ProviderSettings;
  constructor(private readonly apiKey: string, readonly model: string, cfg: Pick<AiConfig, "temperature" | "maxTokens">) {
    this.settings = { provider: "openai", model, temperature: cfg.temperature, maxTokens: cfg.maxTokens, systemPrompt: null, tools: [], endpoint: "https://api.openai.com/v1/chat/completions", apiVersion: null };
  }
  async ask(question: string, timeoutMs: number): Promise<ProviderReply> {
    const raw = await post(
      this.settings.endpoint,
      { authorization: `Bearer ${this.apiKey}` },
      { model: this.model, temperature: this.settings.temperature, max_completion_tokens: this.settings.maxTokens, messages: [{ role: "user", content: question }] },
      timeoutMs
    );
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] };
    const choice = j.choices?.[0];
    const refusal = choice?.message?.refusal ?? null;
    return { text: choice?.message?.content ?? refusal ?? "", finishReason: choice?.finish_reason ?? null, providerRefusal: !!refusal || choice?.finish_reason === "content_filter", raw };
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  readonly settings: ProviderSettings;
  constructor(private readonly apiKey: string, readonly model: string, cfg: Pick<AiConfig, "temperature" | "maxTokens">) {
    this.settings = {
      provider: "gemini",
      model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      systemPrompt: null,
      tools: [],
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      apiVersion: "v1beta",
    };
  }
  async ask(question: string, timeoutMs: number): Promise<ProviderReply> {
    const raw = await post(
      this.settings.endpoint,
      { "x-goog-api-key": this.apiKey },
      { contents: [{ role: "user", parts: [{ text: question }] }], generationConfig: { temperature: this.settings.temperature, maxOutputTokens: this.settings.maxTokens } },
      timeoutMs
    );
    const j = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("\n");
    const blocked = !!j.promptFeedback?.blockReason || cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT";
    return { text, finishReason: cand?.finishReason ?? j.promptFeedback?.blockReason ?? null, providerRefusal: blocked, raw };
  }
}

/** Providers that have a key configured, in a fixed order. */
export function configuredProviders(cfg: AiConfig): AiProvider[] {
  const out: AiProvider[] = [];
  if (cfg.keys.anthropic) out.push(new AnthropicProvider(cfg.keys.anthropic, cfg.models.anthropic, cfg));
  if (cfg.keys.openai) out.push(new OpenAiProvider(cfg.keys.openai, cfg.models.openai, cfg));
  if (cfg.keys.gemini) out.push(new GeminiProvider(cfg.keys.gemini, cfg.models.gemini, cfg));
  return out;
}

/** Wraps a provider as the text generator used for question generation (Part B2). */
export function asGenerator(p: AiProvider, timeoutMs: number): TextGenerator {
  return {
    provider: p.name,
    model: p.model,
    generate: async (prompt: string) => (await p.ask(prompt, timeoutMs)).text,
  };
}

/** Deterministic provider for tests and demos. The script decides each reply from the question and call count. */
export type FakeScript = (question: string, callNo: number) => { text: string; finishReason?: string; refusal?: boolean } | { error: number; retryAfter?: string } | "timeout";

export class FakeProvider implements AiProvider {
  readonly settings: ProviderSettings;
  private readonly calls = new Map<string, number>();
  constructor(readonly name: `fake-${string}`, readonly model: string, private readonly script: FakeScript) {
    this.settings = { provider: name, model, temperature: 0, maxTokens: 1024, systemPrompt: null, tools: [], endpoint: "fake://", apiVersion: null };
  }
  async ask(question: string): Promise<ProviderReply> {
    const n = (this.calls.get(question) ?? 0) + 1;
    this.calls.set(question, n);
    const r = this.script(question, n);
    if (r === "timeout") throw new ProviderTimeoutError("fake timeout");
    if ("error" in r) throw new ProviderHttpError(r.error, JSON.stringify({ error: { message: `fake ${r.error}` } }), r.retryAfter);
    return { text: r.text, finishReason: r.finishReason ?? "stop", providerRefusal: !!r.refusal, raw: JSON.stringify({ text: r.text, finish_reason: r.finishReason ?? "stop" }) };
  }
}
