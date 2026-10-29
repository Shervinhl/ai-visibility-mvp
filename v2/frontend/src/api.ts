import axios, { AxiosError } from "axios";

export const api = axios.create({ baseURL: "/api" });

export function errorText(e: unknown): string {
  const ax = e as AxiosError<{ error?: string }>;
  return ax.response?.data?.error ?? ax.message ?? String(e);
}

export type Status = "PASS" | "FAIL" | "NOT_ASSESSED" | "NOT_APPLICABLE";
export type QuestionType = "RECOMMEND" | "COMPARE" | "PRICE" | "PROBLEM";
export const QUESTION_TYPES: QuestionType[] = ["RECOMMEND", "COMPARE", "PRICE", "PROBLEM"];

export interface FactList {
  businessName: string;
  aliases: string[];
  website: string;
  whatItDoes: string;
  whatItDoesPhrase?: string;
  productCategory: string;
  products: { name: string; description: string }[];
  buyers: string[];
  locations: string[];
  serviceArea?: string;
  prices: { plan: string; amount: number; currency: string; period: string; pageUrl?: string }[];
  contact: { url?: string; email?: string; phone?: string };
  competitors: string[];
  keyPages: string[];
  usesStructuredData?: boolean;
  nameIsCommonWord?: boolean;
  homonyms?: { name: string; contextTerms: string[] }[];
}

export interface Business {
  id: string;
  name: string;
  createdAt: string;
  currentFactListVersion: number;
}

export interface BusinessDetail {
  business: Business;
  factList: { version: number; content: FactList; approvedBy: string; approvedAt: string };
  factListVersions: { version: number; approvedBy: string; approvedAt: string }[];
  checkRuns: { id: string; startedAt: string; finishedAt: string | null; status: string; checkVersion: string; factListVersion: number }[];
  questionSets: { id: string; version: string | null; status: string; createdAt: string; frozenAt: string | null; parentSetId: string | null }[];
  aiRuns: { id: string; questionSetId: string; status: string; startedAt: string; finishedAt: string | null; providers: string[] }[];
  changeEvents: { id: string; description: string; changedAt: string; beforeRunIds: string[]; afterRunIds: string[] }[];
}

export interface Finding {
  checkId: string;
  title: string;
  status: Status;
  whatChecked: string;
  whatFound: string;
  whyItMatters: string;
  whatToChange: string;
  howToRetest: string;
  headline: string;
}

export interface CheckResult {
  checkId: string;
  name: string;
  status: Status;
  reason: string;
  nextStep: string | null;
  evidence: unknown;
  checkVersion: string;
  finding: Finding;
  pages: { pageUrl: string; status: Status; reason: string; nextStep: string | null; evidence: unknown }[];
}

export interface CheckRunView {
  run: { id: string; status: string; startedAt: string; finishedAt: string | null; checkVersion: string; factListVersion: number; meta: Record<string, unknown> | null; error: string | null };
  results: CheckResult[];
}

export interface Question {
  id: string;
  position: number;
  text: string;
  type: QuestionType;
  source: string;
  status: "CANDIDATE" | "APPROVED" | "REMOVED";
  approvedBy: string | null;
  approvedAt: string | null;
  editedBy: string | null;
  originalText: string;
}

export interface QuestionSetView {
  set: { id: string; businessId: string; version: string | null; status: "CANDIDATE" | "APPROVED" | "FROZEN"; createdAt: string; frozenAt: string | null; frozenBy: string | null; parentSetId: string | null; factListVersion: number };
  questions: Question[];
  counts: { CANDIDATE: number; APPROVED: number; REMOVED: number };
  approvedMix: { total: number; byType: Record<QuestionType, number>; byGroup: Record<string, number>; target: string; note: string };
}

export interface Cell {
  questionId: string;
  questionText: string;
  questionType: string;
  provider: string;
  model: string;
  status: "REPORTED" | "NOT_ASSESSED";
  reason: string | null;
  nextStep: string | null;
  validRuns: number;
  refusals: number;
  errors: number;
  timeouts: number;
  mentioned: { count: number; of: number; pendingReview: number; text: string } | null;
  recommended: { count: number; of: number; pendingReview: number; text: string } | null;
  accuracy: { correct: number; incorrect: number; unverifiable: number; pendingReview: number } | null;
  excerpts: { runNo: number; date: string; excerpt: string }[];
  /** Full answers from valid runs in which the business was not mentioned, one per run (each row is one provider). */
  answersNotMentioning: { runNo: number; date: string; text: string; labelSource: "human" | "auto" | null }[];
  answersNamed: { runNo: number; date: string; text: string; matchedTerm: string | null; recommended: boolean; labelSource: "human" | "auto" | null }[];
  lastRunAt: string | null;
}

export interface Overall {
  scope: string;
  validAnswers: number;
  excludedRefusals: number;
  excludedErrors: number;
  excludedTimeouts: number;
  mentioned: { count: number; of: number; wilson95: { low: number; high: number } | null; note: string | null; pendingReview: number; text: string };
  recommended: { count: number; of: number; wilson95: { low: number; high: number } | null; note: string | null; pendingReview: number; text: string };
  /** Valid answers whose label is still automatic (no person has checked them yet). */
  autoLabelOnly: number;
}

export interface ProviderCoverage {
  reporting: string[];
  preliminary: boolean;
  note: string | null;
}

export interface ReviewItem {
  aiRunId: string;
  batchId: string;
  provider: string;
  model: string;
  questionText: string;
  runNo: number;
  reasons: string[];
  answerText: string;
  autoLabel: { mentioned: string; recommended: string | null; accuracy: string | null; details: Record<string, unknown> } | null;
  humanLabels: { mentioned: string; recommended: string | null; accuracy: string | null; labeledBy: string; labeledAt: string; note: string | null }[];
  done: boolean;
}

export interface RunsView {
  questionSet: { id: string; version: string | null; status: string };
  runs: { id: string; status: string; startedAt: string; finishedAt: string | null; providers: string[]; settings: Record<string, unknown>; runsPerQuestion: number; error: string | null; progress: { finalRuns: number; attempts: number } }[];
  shownRunIds: string[];
  perQuestion: Cell[];
  overall: Overall | null;
  perProvider: Overall[];
  coverage: ProviderCoverage;
  competitors: { competitor: string; mentionedIn: number; of: number; text: string }[];
  reviewQueue: ReviewItem[];
  agreement: { sampled: number; humanLabeled: number; mentionAgreement: { agree: number; of: number }; recommendAgreement: { agree: number; of: number }; ruleVersion: string };
}

export interface Comparison {
  questionSetVersion: string | null;
  changeDescription: string;
  changedAt: string;
  providers: string[];
  overall: { before: Overall; after: Overall; statement: string };
  perProvider: { provider: string; before: Overall; after: Overall; statement: string }[];
  perQuestion: { questionId: string; questionText: string; provider: string; before: string; after: string }[];
  caveat: string;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function pct(p: { low: number; high: number } | null): string {
  return p ? `95% interval ${Math.round(p.low * 100)}% to ${Math.round(p.high * 100)}%` : "";
}
