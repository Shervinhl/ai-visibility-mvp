import { Db } from "../db/db";
import * as repo from "../db/repo";
import { AiConfig } from "../config";
import { aggregateCells, aggregateCompetitors, aggregateOverall, providerCoverage } from "../ai/aggregate";
import { AI_SECTION_COPY, notAssessedLine } from "../wording/catalog";

/**
 * GET /api/businesses/:id/report.
 * Every check and every AI result is shown separately. There is no overall score, weight, total or grade
 * anywhere in this response (Core Rule 1); a test walks the whole response to enforce it.
 */
export function buildReport(db: Db, businessId: string, ai: AiConfig, opts: { checkRunId?: string; batchIds?: string[] } = {}) {
  const business = repo.getBusiness(db, businessId);
  const facts = repo.getFactList(db, businessId);
  const nextSteps: { area: string; item: string; status: string; message: string }[] = [];

  // Technical checks
  const runId = opts.checkRunId ?? repo.latestCheckRunId(db, businessId);
  let technical: Record<string, unknown>;
  if (!runId) {
    technical = { status: "NOT_ASSESSED", message: notAssessedLine("a technical check run (start one from the Technical checks screen)"), run: null, findings: [] };
    nextSteps.push({ area: "Can AI read your site?", item: "All checks", status: "NOT_ASSESSED", message: notAssessedLine("a technical check run") });
  } else {
    const { run, results } = repo.getCheckRun(db, runId);
    technical = {
      question: "Can AI read your site?",
      run: { id: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt, checkVersion: run.checkVersion, factListVersion: run.factListVersion, status: run.status, notes: run.meta?.notes ?? [], keyPages: run.meta?.keyPages ?? [], keyPageSource: run.meta?.keyPageSource ?? null, requestsUsed: run.meta?.requestsUsed ?? null, requestCap: run.meta?.requestCap ?? null },
      findings: results.map((r) => ({ ...r.finding, checkVersion: r.checkVersion, nextStep: r.nextStep, pages: r.pages.map((p) => ({ pageUrl: p.pageUrl, status: p.status, reason: p.reason, nextStep: p.nextStep })) })),
    };
    for (const r of results) {
      if (r.status === "NOT_ASSESSED") nextSteps.push({ area: "Can AI read your site?", item: `${r.checkId} ${r.name}`, status: r.status, message: r.finding.headline });
    }
  }

  // AI answers
  const sets = repo.listQuestionSets(db, businessId);
  const frozen = sets.filter((s) => s.status === "FROZEN").sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0));
  let aiSection: Record<string, unknown>;
  if (!frozen.length) {
    aiSection = { question: "Does AI mention you?", ...AI_SECTION_COPY, status: "NOT_ASSESSED", message: notAssessedLine("an approved and frozen question set (20 to 40 questions)") };
    nextSteps.push({ area: "Does AI mention you?", item: "Question set", status: "NOT_ASSESSED", message: notAssessedLine("an approved and frozen question set (20 to 40 questions)") });
  } else {
    const set = frozen[0];
    const batches = opts.batchIds?.length ? opts.batchIds.map((id) => repo.getBatch(db, id)) : repo.listBatches(db, set.id).filter((b) => b.status === "DONE").slice(0, 1);
    if (!batches.length) {
      aiSection = { question: "Does AI mention you?", ...AI_SECTION_COPY, questionSet: { id: set.id, version: set.version }, status: "NOT_ASSESSED", message: notAssessedLine(`a finished AI run on ${set.version}`) };
      nextSteps.push({ area: "Does AI mention you?", item: `Question set ${set.version}`, status: "NOT_ASSESSED", message: notAssessedLine(`a finished AI run on ${set.version} (needs at least two provider API keys)`) });
    } else {
      const ids = batches.map((b) => b.id);
      const runs = repo.finalRuns(db, ids);
      const cells = aggregateCells(runs, ai.minValidRunsToReport);
      const providers = [...new Set(runs.map((r) => r.provider))].sort();
      const queue = repo.reviewQueue(db, ids);
      for (const c of cells.filter((x) => x.status === "NOT_ASSESSED")) {
        nextSteps.push({ area: "Does AI mention you?", item: `"${c.questionText}" on ${c.provider}`, status: "NOT_ASSESSED", message: notAssessedLine(c.nextStep) });
      }
      const usedFactVersion = batches[0].factListVersion;
      const overall = aggregateOverall(runs, cells, "all reporting providers", ai.minAnswersForComparison);
      const coverage = providerCoverage(cells);
      aiSection = {
        question: "Does AI mention you?",
        ...AI_SECTION_COPY,
        questionSet: { id: set.id, version: set.version, frozenAt: set.frozenAt, frozenBy: set.frozenBy },
        factListVersionUsed: usedFactVersion,
        runs: batches.map((b) => ({ id: b.id, startedAt: b.startedAt, finishedAt: b.finishedAt, providers: b.providers, settings: b.settings, runsPerQuestion: b.runsPerQuestion })),
        perQuestion: cells,
        coverage,
        overall,
        perProvider: providers.map((p) => aggregateOverall(runs.filter((r) => r.provider === p), cells.filter((c) => c.provider === p), p, ai.minAnswersForComparison)),
        competitors: facts.content.competitors.length ? aggregateCompetitors(runs, facts.content.competitors, cells) : { note: "No competitor list in the fact list, so competitor mentions are not counted." },
        humanReview: {
          open: queue.filter((q) => !q.done).length,
          items: queue.length,
          agreement: repo.labelAgreement(db, ids),
          /** Answers whose label is still automatic. They are shown as provisional until a person checks them. */
          autoLabelOnly: overall.autoLabelOnly,
        },
      };
    }
  }

  return {
    business: { id: business.id, name: business.name, factListVersion: facts.version },
    generatedAt: new Date().toISOString(),
    technical,
    ai: aiSection,
    nextSteps,
    changes: repo.listChangeEvents(db, businessId).map((c) => ({ id: c.id, description: c.description, changedAt: c.changedAt })),
  };
}

/** Recursively finds any key containing "score", "grade", "weight" or "total" - used by the report test. */
export function findForbiddenKeys(value: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) value.forEach((v, i) => out.push(...findForbiddenKeys(v, `${path}[${i}]`)));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/score|grade|weight|^total$/i.test(k)) out.push(`${path}.${k}`);
      out.push(...findForbiddenKeys(v, `${path}.${k}`));
    }
  }
  return out;
}
