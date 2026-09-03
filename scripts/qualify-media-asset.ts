import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

// Test-owned job execution only. Never start ambient workers or accept a
// production database merely because qualification flags have been set.
assert.equal(process.env.CREATOROS_QUALIFICATION_MODE, "true");
assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
assert.equal(process.env.ASSET_STORAGE_PROVIDER, "local");
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
assert.ok(["/creativesos_browser", "/creativesos_release"].includes(database.pathname));
const assetId = process.argv[2];
assert.match(assetId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const [{ db, closeDatabase }, { mediaProcessingJobs }, { processMediaJob }] = await Promise.all([
  import("../server/db"), import("../shared/schema"), import("../server/media-processing"),
]);
try {
  const jobs = await db.select().from(mediaProcessingJobs).where(and(eq(mediaProcessingJobs.assetId, assetId), eq(mediaProcessingJobs.kind, "package"), eq(mediaProcessingJobs.state, "queued")));
  assert.equal(jobs.length, 1, "The upload route must enqueue exactly one real packaging job");
  const completed = await processMediaJob(jobs[0].id);
  const [result] = await db.select({ state: mediaProcessingJobs.state, errorCode: mediaProcessingJobs.errorCode }).from(mediaProcessingJobs).where(eq(mediaProcessingJobs.id, jobs[0].id));
  assert.equal(completed, true, `The scoped packaging worker must finish (${result?.state}/${result?.errorCode ?? "no-code"})`);
  console.log(JSON.stringify({ assetId, jobId: jobs[0].id, packaging: "qualified", ambientWorkers: false }));
} finally { await closeDatabase(); }
