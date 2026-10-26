import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { Db } from "../db/db";
import * as repo from "../db/repo";
import { AiConfig, CheckConfig, checkVersion } from "../config";
import { FactList, normalizeFactList, validateFactList } from "../facts/types";
import { FetcherDeps } from "../checks/fetcher";
import { Renderer } from "../checks/renderer";
import { planRequests, runChecks } from "../checks/runner";
import { generateCandidates, QUESTION_TYPES, QuestionType, TextGenerator } from "../questions/generate";
import { suggestFacts, SuggestError } from "../facts/suggest";
import { validateReviewer } from "../questions/rules";
import { AiProvider } from "../ai/providers";
import { RunDeps, runQuestionSet } from "../ai/runner";
import { aggregateCells, aggregateCompetitors, aggregateOverall } from "../ai/aggregate";
import { compareRuns } from "../retest/compare";
import { buildReport } from "./report";

export interface AppDeps {
  db: Db;
  checkConfig: CheckConfig;
  aiConfig: AiConfig;
  clock: repo.Clock;
  fetcherDeps: () => FetcherDeps;
  renderer: () => Renderer;
  providers: () => AiProvider[];
  generator: () => TextGenerator | null;
  aiDeps: RunDeps;
  corsOrigin?: string;
}

/** Background jobs; tests await them through `jobs`. */
export interface AppHandle {
  app: express.Express;
  jobs: Set<Promise<void>>;
  idle: () => Promise<void>;
}

const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
};

function requireReviewer(name: unknown): string {
  const p = validateReviewer(name);
  if (p) throw new repo.UserError(400, p);
  return String(name).trim();
}

function parseFacts(body: unknown, maxKeyPages: number): FactList {
  const issues = validateFactList(body, maxKeyPages);
  if (issues.length) throw new repo.UserError(400, `Fact list is not valid: ${issues.map((i) => `${i.field} ${i.problem}`).join("; ")}`);
  return normalizeFactList(body as FactList);
}

export function createApp(deps: AppDeps): AppHandle {
  const { db, checkConfig, aiConfig, clock } = deps;
  const app = express();
  const jobs = new Set<Promise<void>>();
  const track = (p: Promise<void>) => {
    jobs.add(p);
    p.finally(() => jobs.delete(p));
  };
  app.use(cors({ origin: deps.corsOrigin ?? true }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, checkVersion: checkVersion(checkConfig), providersConfigured: deps.providers().map((p) => ({ provider: p.name, model: p.model })) });
  });

  // Fill the business profile from the website (AI reads the page; page metadata is the fallback).
  app.post(
    "/api/facts/suggest",
    wrap(async (req, res) => {
      const website = typeof req.body?.website === "string" ? req.body.website : "";
      try {
        const out = await suggestFacts(website, deps.generator(), checkConfig.maxKeyPages);
        res.json(out);
      } catch (e) {
        if (e instanceof SuggestError) {
          res.status(422).json({ error: e.message });
          return;
        }
        throw e;
      }
    })
  );

  // ---- Businesses and fact lists -------------------------------------------------
  app.post(
    "/api/businesses",
    wrap((req, res) => {
      const approvedBy = requireReviewer(req.body?.approvedBy);
      const facts = parseFacts(req.body?.facts, checkConfig.maxKeyPages);
      const out = repo.createBusiness(db, facts, approvedBy, clock);
      res.status(201).json({ business: out.business, factListVersion: out.factListVersion });
    })
  );

  app.get(
    "/api/businesses",
    wrap((_req, res) => {
      res.json({ businesses: repo.listBusinesses(db) });
    })
  );

  app.get(
    "/api/businesses/:id",
    wrap((req, res) => {
      const id = req.params.id;
      const business = repo.getBusiness(db, id);
      res.json({
        business,
        factList: repo.getFactList(db, id),
        factListVersions: repo.listFactListVersions(db, id),
        checkRuns: repo.listCheckRuns(db, id).map((r) => ({ id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status, checkVersion: r.checkVersion, factListVersion: r.factListVersion })),
        questionSets: repo.listQuestionSets(db, id).map((s) => ({ id: s.id, version: s.version, status: s.status, createdAt: s.createdAt, frozenAt: s.frozenAt, parentSetId: s.parentSetId })),
        aiRuns: repo.listBatchesForBusiness(db, id).map((b) => ({ id: b.id, questionSetId: b.questionSetId, status: b.status, startedAt: b.startedAt, finishedAt: b.finishedAt, providers: b.providers })),
        changeEvents: repo.listChangeEvents(db, id),
      });
    })
  );

  app.put(
    "/api/businesses/:id/fact-list",
    wrap((req, res) => {
      const approvedBy = requireReviewer(req.body?.approvedBy);
      const facts = parseFacts(req.body?.facts, checkConfig.maxKeyPages);
      const version = repo.addFactListVersion(db, req.params.id, facts, approvedBy, clock);
      res.status(201).json({ factListVersion: version });
    })
  );

  // ---- Technical checks -----------------------------------------------------------
  app.post(
    "/api/businesses/:id/checks",
    wrap(async (req, res) => {
      const id = req.params.id;
      const fl = repo.getFactList(db, id);
      const renderer = deps.renderer();
      const renderProblem = await renderer.probe();
      const plan = planRequests(checkConfig, fl.content.keyPages.length || checkConfig.maxKeyPages, renderProblem === null);
      const version = checkVersion(checkConfig);
      const runId = repo.createCheckRun(db, id, fl.version, version, checkConfig, clock);
      track(
        (async () => {
          try {
            const out = await runChecks({ homepage: fl.content.website, keyPages: fl.content.keyPages, facts: fl.content }, checkConfig, deps.fetcherDeps(), renderer);
            repo.saveCheckRunOutput(db, runId, out, clock);
          } catch (e) {
            repo.failCheckRun(db, runId, (e as Error).message, clock);
          }
        })()
      );
      res.status(202).json({ runId, checkVersion: version, estimatedSeconds: plan.estimatedSeconds, plannedRequests: plan.planned, requestCap: checkConfig.maxRequestsPerCheck, warnings: [...plan.warnings, ...(renderProblem ? [`A3 will be NOT_ASSESSED: ${renderProblem}`] : [])] });
    })
  );

  app.get(
    "/api/checks/:runId",
    wrap((req, res) => {
      res.json(repo.getCheckRun(db, req.params.runId));
    })
  );

  // ---- Question sets --------------------------------------------------------------
  app.post(
    "/api/businesses/:id/question-sets/generate",
    wrap(async (req, res) => {
      const id = req.params.id;
      const fl = repo.getFactList(db, id);
      const body = req.body ?? {};
      const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/\r?\n/) : []).map((s) => s.trim()).filter(Boolean);
      const gen = await generateCandidates({
        facts: fl.content,
        generator: deps.generator(),
        customerQuestions: asList(body.customerQuestions),
        gscCsv: typeof body.gscCsv === "string" ? body.gscCsv : undefined,
        searchSuggestions: asList(body.searchSuggestions),
      });
      const setId = repo.createQuestionSet(db, id, fl.version, gen, gen.candidates, clock);
      res.status(201).json({ questionSet: repo.getQuestionSet(db, setId), generation: { templateVersion: gen.templateVersion, generator: gen.generator, mix: gen.mix, removed: gen.removed, warnings: gen.warnings } });
    })
  );

  app.get(
    "/api/question-sets/:id",
    wrap((req, res) => {
      res.json(repo.getQuestionSet(db, req.params.id));
    })
  );

  app.patch(
    "/api/question-sets/:id/questions/:qid",
    wrap((req, res) => {
      const reviewer = requireReviewer(req.body?.reviewer);
      const action = req.body?.action;
      if (action !== "approve" && action !== "edit" && action !== "remove") throw new repo.UserError(400, "action must be approve, edit or remove");
      const type = req.body?.type as QuestionType | undefined;
      if (type !== undefined && !QUESTION_TYPES.includes(type)) throw new repo.UserError(400, `type must be one of ${QUESTION_TYPES.join(", ")}`);
      const out = repo.patchQuestion(db, req.params.id, req.params.qid, action === "edit" ? { action, text: req.body?.text, type } : { action }, reviewer, clock);
      res.json({ ...out, message: out.createdNewSet ? "The set was frozen, so the change was made in a new draft set. Freeze it to create the next version; old results stay linked to the old version." : null, questionSet: repo.getQuestionSet(db, out.questionSetId) });
    })
  );

  app.post(
    "/api/question-sets/:id/questions",
    wrap((req, res) => {
      const reviewer = requireReviewer(req.body?.reviewer);
      const out = repo.addQuestion(db, req.params.id, String(req.body?.text ?? ""), req.body?.type as QuestionType, reviewer, clock);
      res.status(201).json({ ...out, questionSet: repo.getQuestionSet(db, out.questionSetId) });
    })
  );

  app.post(
    "/api/question-sets/:id/freeze",
    wrap((req, res) => {
      const reviewer = requireReviewer(req.body?.reviewer);
      res.json({ questionSet: repo.freezeQuestionSet(db, req.params.id, reviewer, clock) });
    })
  );

  // ---- AI runs ------------------------------------------------------------------------
  app.post(
    "/api/question-sets/:id/runs",
    wrap((req, res) => {
      const setId = req.params.id;
      let providers = deps.providers();
      const wanted: unknown = req.body?.providers;
      if (Array.isArray(wanted) && wanted.length) providers = providers.filter((p) => wanted.includes(p.name));
      if (providers.length < 2) {
        throw new repo.UserError(409, `At least two AI providers are needed; ${providers.length} available. Needs: two of ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY in the backend environment.`);
      }
      const settings: Record<string, unknown> = {};
      for (const p of providers) settings[p.name] = p.settings;
      const { batchId, questions } = repo.createBatch(db, setId, settings, aiConfig.runsPerQuestion, clock);
      const set = repo.getQuestionSet(db, setId).set;
      const facts = repo.getFactList(db, set.businessId, set.factListVersion).content;
      track(
        (async () => {
          try {
            await runQuestionSet(
              questions.map((q) => ({ id: q.id, text: q.text })),
              providers,
              aiConfig,
              deps.aiDeps,
              (recs) => repo.saveAttempts(db, batchId, recs, facts, clock)
            );
            repo.finishBatch(db, batchId, "DONE", null, clock);
          } catch (e) {
            repo.finishBatch(db, batchId, "ERROR", (e as Error).message, clock);
          }
        })()
      );
      res.status(202).json({ runId: batchId, providers: providers.map((p) => ({ provider: p.name, model: p.model })), questions: questions.length, plannedRuns: questions.length * providers.length * aiConfig.runsPerQuestion });
    })
  );

  app.get(
    "/api/question-sets/:id/runs",
    wrap((req, res) => {
      const setId = req.params.id;
      const { set } = repo.getQuestionSet(db, setId);
      const batches = repo.listBatches(db, setId);
      const facts = repo.getFactList(db, set.businessId, set.factListVersion).content;
      const selected = typeof req.query.runId === "string" ? batches.filter((b) => b.id === req.query.runId) : batches.filter((b) => b.status === "DONE").slice(0, 1);
      const ids = selected.map((b) => b.id);
      const runs = repo.finalRuns(db, ids);
      const cells = aggregateCells(runs, aiConfig.minValidRunsToReport);
      const providers = [...new Set(runs.map((r) => r.provider))].sort();
      res.json({
        questionSet: { id: set.id, version: set.version, status: set.status },
        runs: batches.map((b) => ({ ...b, progress: repo.batchProgress(db, b.id) })),
        shownRunIds: ids,
        perQuestion: cells,
        overall: ids.length ? aggregateOverall(runs, cells, "all providers", aiConfig.minAnswersForComparison) : null,
        perProvider: providers.map((p) => aggregateOverall(runs.filter((r) => r.provider === p), cells.filter((c) => c.provider === p), p, aiConfig.minAnswersForComparison)),
        competitors: facts.competitors.length ? aggregateCompetitors(runs, facts.competitors, cells) : [],
        reviewQueue: repo.reviewQueue(db, ids),
        agreement: repo.labelAgreement(db, ids),
      });
    })
  );

  app.post(
    "/api/ai-runs/:id/labels",
    wrap((req, res) => {
      const b = req.body ?? {};
      repo.addHumanLabel(db, req.params.id, { mentioned: b.mentioned, recommended: b.recommended, accuracy: b.accuracy, labeledBy: b.labeledBy, note: b.note }, clock);
      res.status(201).json({ ok: true });
    })
  );

  // ---- Report and re-tests ------------------------------------------------------------
  app.get(
    "/api/businesses/:id/report",
    wrap((req, res) => {
      const batchIds = typeof req.query.runIds === "string" ? req.query.runIds.split(",").filter(Boolean) : undefined;
      const checkRunId = typeof req.query.checkRunId === "string" ? req.query.checkRunId : undefined;
      res.json(buildReport(db, req.params.id, aiConfig, { batchIds, checkRunId }));
    })
  );

  app.post(
    "/api/change-events",
    wrap((req, res) => {
      const b = req.body ?? {};
      const ev = repo.createChangeEvent(db, { businessId: String(b.businessId ?? ""), description: String(b.description ?? ""), changedAt: String(b.changedAt ?? ""), beforeRunIds: Array.isArray(b.beforeRunIds) ? b.beforeRunIds.map(String) : [], afterRunIds: Array.isArray(b.afterRunIds) ? b.afterRunIds.map(String) : [], createdBy: b.createdBy }, clock);
      res.status(201).json({ changeEvent: ev, comparison: comparisonFor(ev) });
    })
  );

  app.get(
    "/api/change-events/:id",
    wrap((req, res) => {
      const ev = repo.getChangeEvent(db, req.params.id);
      res.json({ changeEvent: ev, comparison: comparisonFor(ev) });
    })
  );

  function comparisonFor(ev: repo.ChangeEventRow) {
    const meta = repo.batchMeta(db, ev.beforeRunIds[0]);
    return compareRuns(repo.finalRuns(db, ev.beforeRunIds), repo.finalRuns(db, ev.afterRunIds), {
      questionSetVersion: meta.questionSetVersion,
      changeDescription: ev.description,
      changedAt: ev.changedAt,
      minValidRuns: aiConfig.minValidRunsToReport,
      minForComparison: aiConfig.minAnswersForComparison,
    });
  }

  // ---- Errors ------------------------------------------------------------------------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof repo.UserError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const msg = (err as Error)?.message ?? "Unexpected error";
    if (/immutable|frozen/i.test(msg)) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  });

  return {
    app,
    jobs,
    idle: async () => {
      while (jobs.size) await Promise.allSettled([...jobs]);
    },
  };
}
