import assert from "node:assert/strict";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { mediaWorkerIdentity, processMediaJob, stopMediaCloudProcessing } from "../server/media-processing";
import { assets, mediaProcessingJobs } from "../shared/schema";

/** Exercise real claims/error cleanup without accessing any storage or provider. */
export async function qualifyMediaWorkerAdmission(asset: typeof assets.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const identity = mediaWorkerIdentity();
  assert.equal(identity.maxConcurrency, 2, "This fixture requires the default two-slot media worker");
  assert(identity.capabilities.includes("probe"));
  await db.update(assets).set({ status: "pending" }).where(eq(assets.id, asset.id));
  const createJob = () => ({ assetId: asset.id, ownerUserId: asset.ownerUserId, businessId: asset.businessId, kind: "probe" as const, state: "queued" as const, idempotencyKey: `admission:${crypto.randomUUID()}` });
  const jobs = await db.insert(mediaProcessingJobs).values(Array.from({ length: 6 }, createJob)).returning();
  const ids = jobs.map((job) => job.id);
  const state = () => db.select().from(mediaProcessingJobs).where(inArray(mediaProcessingJobs.id, ids));
  let releaseLock!: () => void, lockReady!: (xid: string) => void;
  const held = new Promise<void>((resolve) => { releaseLock = resolve; });
  const ready = new Promise<string>((resolve) => { lockReady = resolve; });
  const lock = db.transaction(async (transaction) => {
    await transaction.select().from(mediaProcessingJobs).where(inArray(mediaProcessingJobs.id, ids)).for("update");
    const rows = await transaction.execute(sql`SELECT pg_current_xact_id()::text AS xid`);
    lockReady(String(rows[0].xid));
    await held;
  });
  const xid = await Promise.race([ready, lock.then(() => { throw new Error("Media lock exited before admission proof"); })]);
  const settled: string[] = [];
  const requests = ids.map((id) => processMediaJob(id).finally(() => { settled.push(id); }));
  let blockedClaims = 0;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await db.execute(sql`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'transactionid' AND transactionid::text = ${xid} AND NOT granted`);
      blockedClaims = Number(rows[0].count);
      if (blockedClaims === 2 && settled.length === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blockedClaims, 2, "Only admitted media claims may wait on fixture row locks");
    assert.deepEqual(settled.sort(), ids.slice(2).sort());
    assert((await state()).every((job) => job.state === "queued" && job.attempt === 0 && job.leaseToken === null));
  } finally {
    releaseLock();
    await lock;
    await Promise.all(requests);
  }
  let rows = await state();
  assert.equal(rows.filter((job) => job.state === "failed" && job.errorCode === "asset_unavailable" && job.attempt === 1).length, 2);
  assert.equal(rows.filter((job) => job.state === "queued" && job.attempt === 0 && job.leaseToken === null).length, 4);
  await Promise.all([processMediaJob(ids[0]), processMediaJob(crypto.randomUUID())]);
  for (const chunk of [ids.slice(2, 4), ids.slice(4, 6)]) await Promise.all(chunk.map(processMediaJob));
  rows = await state();
  assert(rows.every((job) => job.state === "failed" && job.errorCode === "asset_unavailable" && job.attempt === 1 && job.leaseExpiresAt === null && job.workerId === identity.id));
  await stopMediaCloudProcessing();
  const [drained] = await db.insert(mediaProcessingJobs).values(createJob()).returning();
  assert.equal(await processMediaJob(drained.id), false);
  const [stillQueued] = await db.select().from(mediaProcessingJobs).where(eq(mediaProcessingJobs.id, drained.id));
  assert.equal(stillQueued.state, "queued"); assert.equal(stillQueued.attempt, 0); assert.equal(stillQueued.leaseToken, null);
  await db.delete(mediaProcessingJobs).where(inArray(mediaProcessingJobs.id, [...ids, drained.id]));
  await db.update(assets).set({ status: asset.status }).where(eq(assets.id, asset.id));
  return { configuredSlots: 2, blockedClaims, overCapacityUnclaimed: 4, unavailableAssetsRejectedAfterReadmission: 6, attemptsPerAdmittedJob: 1, missingClaimReleased: true, drainPreservedQueue: true };
}
