import { AddressInfo } from "net";
import { Server } from "http";
import { openDb, Db } from "../../src/db/db";
import { createApp, AppHandle } from "../../src/api/app";
import { loadAiConfig, loadCheckConfig } from "../../src/config";
import { Clock } from "../../src/db/repo";
import { FakeRenderer, FakeTransport, fakeDeps } from "./fakeTransport";
import { flowjinRoutes, flowjinFacts } from "../fixtures/flowjin/site";
import { fakeGenerator, flowjinProviders } from "./fakeAi";
import { AiProvider } from "../../src/ai/providers";
import { FactList } from "../../src/facts/types";

/** Deterministic ids and timestamps. */
export function testClock(): Clock {
  let n = 0;
  let t = Date.parse("2026-10-25T13:00:00.000Z");
  return {
    now: () => new Date((t += 1000)),
    id: () => `id-${String(++n).padStart(5, "0")}`,
  };
}

export interface TestServer {
  base: string;
  db: Db;
  handle: AppHandle;
  server: Server;
  close: () => Promise<void>;
  call: <T = any>(method: string, path: string, body?: unknown) => Promise<{ status: number; body: T }>;
}

export async function startServer(opts: { providers?: () => AiProvider[] } = {}): Promise<TestServer> {
  const db = openDb(":memory:");
  const aiCfg = { ...loadAiConfig(), keys: {}, runsPerQuestion: 3, minValidRunsToReport: 2, minAnswersForComparison: 10, concurrencyPerProvider: 2 };
  const handle = createApp({
    db,
    checkConfig: loadCheckConfig({ requestDelayMs: 0 }),
    aiConfig: aiCfg,
    clock: testClock(),
    fetcherDeps: () => fakeDeps(new FakeTransport(flowjinRoutes)),
    renderer: () => new FakeRenderer("not-installed"),
    providers: opts.providers ?? flowjinProviders,
    generator: () => fakeGenerator(),
    aiDeps: { sleep: async () => undefined, now: (() => { let t = Date.parse("2026-10-25T14:00:00.000Z"); return () => new Date((t += 1000)); })(), random: () => 0 },
  });
  const server = handle.app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async <T,>(method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as T };
  };
  return {
    base,
    db,
    handle,
    server,
    call,
    close: async () => {
      await handle.idle();
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  };
}

export const REVIEWER = "Test Reviewer";

/** Full Flowjin flow: business, technical checks, questions (approved + frozen), one AI run. */
export async function flowjinPipeline(s: TestServer, facts: FactList = flowjinFacts) {
  const created = await s.call("POST", "/api/businesses", { facts, approvedBy: REVIEWER });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const businessId: string = created.body.business.id;
  const started = await s.call("POST", `/api/businesses/${businessId}/checks`);
  await s.handle.idle();
  const checks = await s.call("GET", `/api/checks/${started.body.runId}`);
  const gen = await s.call("POST", `/api/businesses/${businessId}/question-sets/generate`, { customerQuestions: ["What's the best AI tool to clip podcasts?", "Is Flowjin worth it?"] });
  const setId: string = gen.body.questionSet.set.id;
  for (const q of gen.body.questionSet.questions as { id: string }[]) {
    await s.call("PATCH", `/api/question-sets/${setId}/questions/${q.id}`, { action: "approve", reviewer: REVIEWER });
  }
  const frozen = await s.call("POST", `/api/question-sets/${setId}/freeze`, { reviewer: REVIEWER });
  const run = await s.call("POST", `/api/question-sets/${setId}/runs`, {});
  await s.handle.idle();
  const runs = await s.call("GET", `/api/question-sets/${setId}/runs`);
  const report = await s.call("GET", `/api/businesses/${businessId}/report`);
  return { businessId, checkStart: started.body, checks: checks.body, generation: gen.body, setId, frozen: frozen.body, aiRunId: run.body.runId as string, aiRunStart: run.body, runs: runs.body, report: report.body };
}

/** Removes ids and timestamps so two runs of the same fixture can be compared. */
export function stripVolatile(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripVolatile);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(id|at|date)$|Id$|Ids$|At$|^generatedAt$|^observedAt$|^fetchedAt$/.test(k)) continue;
      out[k] = stripVolatile(val);
    }
    return out;
  }
  if (typeof v === "string") return v.replace(/id-\d{5}/g, "<id>").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<time>");
  return v;
}
