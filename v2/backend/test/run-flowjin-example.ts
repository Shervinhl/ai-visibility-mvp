/**
 * Runs the full v2 flow on the Flowjin fixtures (fake HTTP site, fake AI providers) and saves the
 * report as v2/examples/flowjin-report.json. Run with: npm run example:flowjin
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { startServer, flowjinPipeline } from "./helpers/pipeline";
import { findForbiddenKeys } from "../src/api/report";

async function main() {
  const s = await startServer();
  try {
    const p = await flowjinPipeline(s);
    const forbidden = findForbiddenKeys(p.report);
    if (forbidden.length) throw new Error(`Report contains forbidden fields: ${forbidden.join(", ")}`);
    const out = {
      note: "Example report from Flowjin fixtures. The site and AI answers are fixtures (fake HTTP site, fake AI providers), not live data. See test/fixtures/flowjin/site.ts.",
      report: p.report,
      technicalCheckDetail: p.checks,
    };
    const dir = path.resolve(__dirname, "..", "..", "examples");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "flowjin-report.json");
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`Saved ${file}`);
    console.log("\nTechnical checks:");
    for (const f of p.report.technical.findings) console.log(`  ${f.checkId.padEnd(4)} ${f.status.padEnd(15)} ${f.headline}`);
    console.log(`\nAI answers: ${p.report.ai.overall.mentioned.text}; ${p.report.ai.overall.recommended.text}`);
    console.log("\nNOT_ASSESSED items:");
    for (const n of p.report.nextSteps) console.log(`  [${n.area}] ${n.item}: ${n.message}`);
  } finally {
    await s.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
