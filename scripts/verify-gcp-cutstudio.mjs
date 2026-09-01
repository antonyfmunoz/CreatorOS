import assert from "node:assert/strict";
import fs from "node:fs";

const policy = JSON.parse(fs.readFileSync("infra/gcp/cutstudio-render-plane.json", "utf8"));
const dockerfile = fs.readFileSync("Dockerfile.cut-cloud", "utf8");
const provision = fs.readFileSync("scripts/provision-gcp-cutstudio.ps1", "utf8");
const sync = fs.readFileSync("scripts/sync-gcp-cutstudio-secrets.ps1", "utf8");
const worker = fs.readFileSync("server/cut-worker.ts", "utf8");
const studio = fs.readFileSync("server/cut-studio.ts", "utf8");

assert.equal(policy.project, "creativesos-504623");
assert.equal(policy.budget.monthlyUsd, 25);
assert.deepEqual(policy.budget.alertPercentages, [50, 75, 90, 100]);
assert.equal(policy.dispatcher.minimumInstances, 0);
assert.ok(policy.dispatcher.maximumInstances <= 2);
assert.equal(policy.worker.maximumClaimsPerExecution, 1);
assert.equal(policy.worker.canonicalStorage, "r2");
assert.match(dockerfile, /USER node/);
assert.match(dockerfile, /ffmpeg/);
assert.match(provision, /roles\/run\.invoker/);
assert.match(provision, /roles\/secretmanager\.secretAccessor/);
assert.match(provision, /--min-instances", "0"/);
assert.match(sync, /op:\/\/\$Vault\/Google Cloud CutStudio\/password/);
assert.match(sync, /read --no-newline/);
assert.doesNotMatch(sync, /Write-Output\s+\$?value/i);
assert.match(worker, /CUT_WORKER_RUN_ONCE/);
assert.match(studio, /dispatchCutStudioCloudJob/);

process.stdout.write(`${JSON.stringify({ status: "verified", policy: policy.schemaVersion, project: policy.project, region: policy.region })}\n`);
