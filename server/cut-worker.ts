import "dotenv/config";
import { closeDatabase } from "./db";
import {
  cutWorkerIdentity,
  processDueCutStudioJobs,
  recoverInterruptedCutStudioJobs,
  scheduleCutStudioProcessing,
  stopCutStudioProcessing,
} from "./cut-studio";

if (process.env.CREATOROS_DEMO_MODE === "true" || process.env.CREATOROS_QUALIFICATION_MODE === "true") {
  throw new Error("The standalone CutStudio worker cannot run in demo or qualification mode");
}

async function main() {
  const identity = cutWorkerIdentity();
  // This clock includes static imports, unlike a timer started inside main().
  // Compare with execution timestamps to separate process bootstrap from the
  // platform's image/container startup; it is elapsed time, not CPU time.
  const processUptimeMs = Math.round(process.uptime() * 1_000);
  process.stdout.write(`${JSON.stringify({ event: "cut.worker.start", workerId: identity.id, region: identity.region, capabilities: identity.capabilities, maxConcurrency: identity.maxConcurrency, processUptimeMs })}\n`);
  if (process.env.CUT_WORKER_RUN_ONCE === "true") {
    const recovered = await recoverInterruptedCutStudioJobs();
    const processed = await processDueCutStudioJobs(1);
    process.stdout.write(`${JSON.stringify({ event: "cut.worker.complete", workerId: identity.id, recovered, processed })}\n`);
    await stopCutStudioProcessing().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    return;
  }
  scheduleCutStudioProcessing();
  const keepAlive = setInterval(() => undefined, 60_000);
  let stopping = false;
  async function stop(signal: string) {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    process.stdout.write(`${JSON.stringify({ event: "cut.worker.stop", workerId: identity.id, signal })}\n`);
    await stopCutStudioProcessing().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  }
  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}

void main().catch(async (error) => {
  console.error(JSON.stringify({ event: "cut.worker.fatal", errorType: error instanceof Error ? error.name : typeof error }));
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
