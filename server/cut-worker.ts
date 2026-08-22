import "dotenv/config";
import { closeDatabase } from "./db";
import {
  cutWorkerIdentity,
  scheduleCutStudioProcessing,
  stopCutStudioProcessing,
} from "./cut-studio";

if (process.env.CREATOROS_DEMO_MODE === "true" || process.env.CREATOROS_QUALIFICATION_MODE === "true") {
  throw new Error("The standalone CutStudio worker cannot run in demo or qualification mode");
}

async function main() {
  const identity = cutWorkerIdentity();
  process.stdout.write(`${JSON.stringify({ event: "cut.worker.start", workerId: identity.id, region: identity.region, capabilities: identity.capabilities, maxConcurrency: identity.maxConcurrency })}\n`);
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
