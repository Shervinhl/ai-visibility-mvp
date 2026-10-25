import { existsSync } from "fs";
import path from "path";

// Load v2/backend/.env if present (Node 21.7+). Real environment variables win over the file.
const envFile = path.resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

import { loadConfig } from "./config";
import { openDb } from "./db/db";
import { realClock } from "./db/repo";
import { realDeps } from "./checks/fetcher";
import { PlaywrightRenderer } from "./checks/renderer";
import { asGenerator, configuredProviders } from "./ai/providers";
import { createApp } from "./api/app";

const cfg = loadConfig();
const db = openDb(cfg.dbPath);

const { app } = createApp({
  db,
  checkConfig: cfg.checks,
  aiConfig: cfg.ai,
  clock: realClock,
  fetcherDeps: realDeps,
  renderer: () => new PlaywrightRenderer(cfg.checks.userAgent, cfg.checks.renderTimeoutMs),
  providers: () => configuredProviders(cfg.ai),
  generator: () => {
    const first = configuredProviders(cfg.ai)[0];
    return first ? asGenerator(first, cfg.ai.timeoutMs) : null;
  },
  aiDeps: { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => new Date(), random: Math.random },
  corsOrigin: cfg.corsOrigin,
});

app.listen(cfg.port, () => {
  const providers = configuredProviders(cfg.ai).map((p) => `${p.name} (${p.model})`);
  console.log(`AI Visibility Check v2 backend on http://localhost:${cfg.port}`);
  console.log(`Database: ${cfg.dbPath}`);
  console.log(`AI providers configured: ${providers.length ? providers.join(", ") : "none (set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY)"}`);
});
