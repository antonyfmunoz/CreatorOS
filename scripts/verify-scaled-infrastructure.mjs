#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = readFileSync(join(root, "infra", "fly.production-scaled.toml"), "utf8");
const staging = readFileSync(join(root, "infra", "fly.staging.toml"), "utf8");
const policy = JSON.parse(readFileSync(join(root, "infra", "worker-scaling-policy.json"), "utf8"));

for (const [name, manifest] of [["production", production], ["staging", staging]]) {
  for (const invariant of [
    'release_command = "node scripts/migrate-production.mjs"',
    'web = "node dist/index.js"',
    'media = "npm run media:worker"',
    'cut = "npm run cut:worker"',
    'MEDIA_PROCESSING_MODE = "external"',
    'CUT_STUDIO_PROCESSING_MODE = "external"',
    'path = "/api/ready"',
    'processes = ["web"]',
  ]) if (!manifest.includes(invariant)) throw new Error(`${name} manifest is missing invariant: ${invariant}`);
}
if (production.includes('app = "creatoros-staging"') || staging.includes('app = "creatoros-app"')) throw new Error("Production and staging app identities overlap");
if (policy.schemaVersion !== "creativesos.worker-scaling.v1" || policy.monthlyCostCeilingUsd <= 0) throw new Error("Scaling policy identity or cost ceiling is invalid");
for (const [queue, config] of Object.entries(policy.queues)) {
  if (!Number.isInteger(config.min) || !Number.isInteger(config.max) || config.min < 1 || config.max < config.min) throw new Error(`Invalid ${queue} worker bounds`);
  if (config.targetQueuedPerWorker < 1 || config.scaleOutOldestQueuedSeconds < 1 || config.scaleInIdleSeconds <= policy.cooldownSeconds) throw new Error(`Invalid ${queue} scaling thresholds`);
}
if (!Object.values(policy.failClosed).every(Boolean)) throw new Error("Scaling safety gates must fail closed");
console.log(JSON.stringify({ status: "qualified", environments: ["production", "staging"], processGroups: ["web", "media", "cut"], costCeilingUsd: policy.monthlyCostCeilingUsd }));
