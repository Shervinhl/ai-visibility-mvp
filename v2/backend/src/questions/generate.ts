import { FactList } from "../facts/types";
import { wordBoundaryRegex } from "../checks/html";

/**
 * Part B2: candidate question generation.
 * The LLM prompt is a fixed, versioned template. Changing any wording means a new template version.
 */

export type QuestionType = "RECOMMEND" | "COMPARE" | "PRICE" | "HOWTO" | "PROBLEM";
export const QUESTION_TYPES: QuestionType[] = ["RECOMMEND", "COMPARE", "PRICE", "HOWTO", "PROBLEM"];
export type QuestionSource = "LLM" | "CUSTOMER" | "GSC" | "SUGGESTION" | "REVIEWER";

export interface CandidateQuestion {
  text: string;
  type: QuestionType;
  source: QuestionSource;
}

export interface RemovedQuestion {
  text: string;
  source: QuestionSource;
  reason: string;
}

/** Minimal text-generation interface; provider adapters in src/ai implement it. */
export interface TextGenerator {
  readonly provider: string;
  readonly model: string;
  generate(prompt: string): Promise<string>;
}

export const QGEN_TEMPLATE_VERSION = "qgen-template-v1";
export const QGEN_TEMPLATE =
  "You are writing questions a real buyer would ask an AI assistant when looking for [product category] for [buyer type]. Write natural questions. Do not include the company name. Do not invent facts. Output one question per line with a type tag: RECOMMEND, COMPARE, PRICE, HOWTO, or PROBLEM.";

export const MIN_CANDIDATES = 30;
export const MAX_CANDIDATES = 40;
/** Buyer types used for generation calls (each buyer type is one LLM call). */
export const MAX_BUYER_TYPES_PER_GENERATION = 5;

export function buildGenerationPrompt(productCategory: string, buyerType: string, count: number, references: string[]): string {
  const lines = [QGEN_TEMPLATE.replace("[product category]", productCategory).replace("[buyer type]", buyerType), `Write ${count} questions.`, 'Format each line as: TYPE: question (for example "RECOMMEND: ...").'];
  if (references.length) {
    lines.push("Real wording from buyers, for tone only (do not copy, do not use any company names):");
    for (const r of references.slice(0, 15)) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}

const TAG_RE = /\b(RECOMMEND|COMPARE|PRICE|HOWTO|PROBLEM)\b/;

/** Parses LLM output lines like "RECOMMEND: ...", "[PRICE] ...", "1. ... (HOWTO)", "... | COMPARE". */
export function parseTaggedLines(text: string): { text: string; type: QuestionType }[] {
  const out: { text: string; type: QuestionType }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = TAG_RE.exec(line);
    if (!m) continue;
    const type = m[1] as QuestionType;
    const q = line
      .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
      .replace(/\[?\(?\b(RECOMMEND|COMPARE|PRICE|HOWTO|PROBLEM)\b\)?\]?\s*[:|\-–—]?\s*/, "")
      .replace(/\s*[|\-–—:]\s*$/, "")
      .replace(/^["“]|["”]$/g, "")
      .trim();
    if (q.length < 8 || !/[\p{L}]/u.test(q)) continue;
    out.push({ text: q, type });
  }
  return out;
}

/** Rule-based type for client-supplied questions (no LLM involved). */
export function classifyQuestion(q: string): QuestionType {
  const s = q.toLowerCase();
  if (/\b(vs\.?|versus|compare|compared|comparison|alternatives?|better than|difference between)\b/.test(s)) return "COMPARE";
  if (/\b(price|prices|pricing|cost|costs|how much|cheap|cheapest|free|affordable|per month|subscription|plan|plans)\b/.test(s)) return "PRICE";
  if (/\b(best|top|recommend|recommendation|which (tool|app|service|software|company)|what (tool|app|service|software) should)\b/.test(s)) return "RECOMMEND";
  if (/^(how (do|can|to|should)|what('s| is) the best way|steps to)\b/.test(s)) return "HOWTO";
  return "PROBLEM";
}

/** Case and punctuation insensitive key. */
export function exactKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-order insensitive key: questions with the same words in a different order collide. */
export function bagKey(q: string): string {
  return exactKey(q).split(" ").filter(Boolean).sort().join(" ");
}

export function mentionsBusiness(q: string, facts: Pick<FactList, "businessName" | "aliases">): string | null {
  for (const term of [facts.businessName, ...facts.aliases]) {
    if (term && wordBoundaryRegex(term).test(q)) return term;
  }
  return null;
}

/** Minimal CSV parser (quoted fields, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * Google Search Console "Queries" export: first column header is "Top queries" or "Query".
 * Keeps only queries that read as questions or contain 4+ words (short keywords are not buyer questions).
 */
export function queriesFromGscCsv(csv: string): string[] {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  let col = header.findIndex((h) => h === "top queries" || h === "query" || h === "queries");
  const body = col >= 0 ? rows.slice(1) : rows;
  if (col < 0) col = 0;
  return body
    .map((r) => (r[col] ?? "").trim())
    .filter((q) => q && (/\?$|^(how|what|which|who|where|why|is|are|can|should|do|does|best|top)\b/i.test(q) || q.split(/\s+/).length >= 4));
}

export function toQuestion(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[?.!]$/.test(cap) ? cap : `${cap}?`;
}

export type MixGroup = "RECOMMEND" | "COMPARE_OR_PRICE" | "HOWTO_OR_PROBLEM";
export function mixGroup(t: QuestionType): MixGroup {
  return t === "RECOMMEND" ? "RECOMMEND" : t === "COMPARE" || t === "PRICE" ? "COMPARE_OR_PRICE" : "HOWTO_OR_PROBLEM";
}

export interface MixReport {
  total: number;
  byType: Record<QuestionType, number>;
  byGroup: Record<MixGroup, number>;
  target: string;
  note: string;
}

export function mixReport(qs: { type: QuestionType }[]): MixReport {
  const byType = { RECOMMEND: 0, COMPARE: 0, PRICE: 0, HOWTO: 0, PROBLEM: 0 } as Record<QuestionType, number>;
  const byGroup = { RECOMMEND: 0, COMPARE_OR_PRICE: 0, HOWTO_OR_PROBLEM: 0 } as Record<MixGroup, number>;
  for (const q of qs) {
    byType[q.type] += 1;
    byGroup[mixGroup(q.type)] += 1;
  }
  const total = qs.length;
  const third = total / 3;
  const off = (Object.keys(byGroup) as MixGroup[]).filter((g) => Math.abs(byGroup[g] - third) > Math.max(2, total * 0.1));
  return {
    total,
    byType,
    byGroup,
    target: "about one third RECOMMEND, one third COMPARE or PRICE, one third HOWTO or PROBLEM",
    note: total === 0 ? "No questions." : off.length ? `Mix is off target for: ${off.join(", ")}.` : "Mix is close to target.",
  };
}

export interface GenerationInput {
  facts: FactList;
  generator: TextGenerator | null;
  customerQuestions?: string[];
  gscCsv?: string;
  searchSuggestions?: string[];
}

export interface GenerationOutput {
  templateVersion: string;
  generator: { provider: string; model: string } | null;
  prompts: string[];
  rawOutputs: string[];
  candidates: CandidateQuestion[];
  removed: RemovedQuestion[];
  mix: MixReport;
  warnings: string[];
}

/** Picks up to `max` questions, balancing the three mix groups; client-sourced questions come first. */
export function balance(qs: CandidateQuestion[], max: number): CandidateQuestion[] {
  if (qs.length <= max) return qs;
  const pri = (q: CandidateQuestion) => (q.source === "LLM" ? 1 : 0);
  const groups: Record<MixGroup, CandidateQuestion[]> = { RECOMMEND: [], COMPARE_OR_PRICE: [], HOWTO_OR_PROBLEM: [] };
  qs.forEach((q) => groups[mixGroup(q.type)].push(q));
  for (const g of Object.values(groups)) g.sort((a, b) => pri(a) - pri(b));
  const out: CandidateQuestion[] = [];
  const order: MixGroup[] = ["RECOMMEND", "COMPARE_OR_PRICE", "HOWTO_OR_PROBLEM"];
  while (out.length < max && order.some((g) => groups[g].length)) {
    for (const g of order) {
      if (out.length >= max) break;
      const q = groups[g].shift();
      if (q) out.push(q);
    }
  }
  return out;
}

export async function generateCandidates(input: GenerationInput): Promise<GenerationOutput> {
  const { facts } = input;
  const warnings: string[] = [];
  const pool: CandidateQuestion[] = [];
  const clientSupplied: { text: string; source: QuestionSource }[] = [
    ...(input.customerQuestions ?? []).map((t) => ({ text: t, source: "CUSTOMER" as const })),
    ...(input.gscCsv ? queriesFromGscCsv(input.gscCsv) : []).map((t) => ({ text: t, source: "GSC" as const })),
    ...(input.searchSuggestions ?? []).map((t) => ({ text: t, source: "SUGGESTION" as const })),
  ].filter((x) => x.text.trim());
  for (const c of clientSupplied) pool.push({ text: toQuestion(c.text), type: classifyQuestion(c.text), source: c.source });

  const prompts: string[] = [];
  const rawOutputs: string[] = [];
  if (input.generator) {
    const buyers = facts.buyers.slice(0, MAX_BUYER_TYPES_PER_GENERATION);
    const per = Math.ceil(((MIN_CANDIDATES + MAX_CANDIDATES) / 2 + 6) / buyers.length); // ask for a few extra to survive de-duplication
    const references = clientSupplied.filter((c) => !mentionsBusiness(c.text, facts)).map((c) => c.text);
    for (const buyer of buyers) {
      const prompt = buildGenerationPrompt(facts.productCategory, buyer, per, references);
      prompts.push(prompt);
      const text = await input.generator.generate(prompt);
      rawOutputs.push(text);
      for (const q of parseTaggedLines(text)) pool.push({ text: toQuestion(q.text), type: q.type, source: "LLM" });
    }
  } else {
    warnings.push("No AI provider key is configured, so only client-supplied questions were used. Needs: ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  const removed: RemovedQuestion[] = [];
  const kept: CandidateQuestion[] = [];
  const exact = new Set<string>();
  const bags = new Set<string>();
  for (const q of pool) {
    const brand = mentionsBusiness(q.text, facts);
    if (brand) {
      removed.push({ text: q.text, source: q.source, reason: `contains the business name or alias "${brand}"` });
      continue;
    }
    const e = exactKey(q.text);
    const b = bagKey(q.text);
    if (exact.has(e)) {
      removed.push({ text: q.text, source: q.source, reason: "duplicate (same words, case or punctuation differ)" });
      continue;
    }
    if (bags.has(b)) {
      removed.push({ text: q.text, source: q.source, reason: "duplicate (same words in a different order)" });
      continue;
    }
    exact.add(e);
    bags.add(b);
    kept.push(q);
  }
  const candidates = balance(kept, MAX_CANDIDATES);
  for (const q of kept) if (!candidates.includes(q)) removed.push({ text: q.text, source: q.source, reason: `over the ${MAX_CANDIDATES}-question maximum (trimmed to keep the mix balanced)` });
  if (candidates.length < MIN_CANDIDATES) warnings.push(`Only ${candidates.length} candidate questions (target ${MIN_CANDIDATES} to ${MAX_CANDIDATES}). Add questions by hand or supply customer questions.`);
  return {
    templateVersion: QGEN_TEMPLATE_VERSION,
    generator: input.generator ? { provider: input.generator.provider, model: input.generator.model } : null,
    prompts,
    rawOutputs,
    candidates,
    removed,
    mix: mixReport(candidates),
    warnings,
  };
}
