import "dotenv/config";
import { closeDatabase } from "./db";
import {
  mediaWorkerIdentity,
  scheduleMediaCloudProcessing,
  stopMediaCloudProcessing,
} from "./media-processing";

if (process.env.CREATOROS_DEMO_MODE === "true" || process.env.CREATOROS_QUALIFICATION_MODE === "true") {
  throw new Error("The standalone media worker cannot run in demo or qualification mode");
}

async function main() {
  const identity = mediaWorkerIdentity();
  process.stdout.write(`${JSON.stringify({ event: "media.worker.start", workerId: identity.id, region: identity.region, capabilities: identity.capabilities, maxConcurrency: identity.maxConcurrency })}\n`);

  scheduleMediaCloudProcessing();
  const keepAlive = setInterval(() => undefined, 60_000);

  let stopping = false;
  async function stop(signal: string) {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    process.stdout.write(`${JSON.stringify({ event: "media.worker.stop", workerId: identity.id, signal })}\n`);
    await stopMediaCloudProcessing().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  }

  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}

void main().catch(async (error) => {
  console.error(JSON.stringify({ event: "media.worker.fatal", errorType: error instanceof Error ? error.name : typeof error }));
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
