import assert from "node:assert/strict";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { cutWorkerIdentity, processCutStudioJob, stopCutStudioProcessing } from "../server/cut-studio";
import { cutStudioJobs, cutStudioProjects } from "../shared/schema";

/** Real processor/SQL exercise; no provider, media binary or mocked claim path. */
export async function qualifyCutWorkerAdmission(project: typeof cutStudioProjects.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const identity = cutWorkerIdentity();
  assert.equal(identity.maxConcurrency, 2, "This bounded fixture requires the default two-slot worker");
  assert(identity.capabilities.includes("cut_highlights"));
  const transcript = { duration: 10, language: "en", segments: [{ id: "0", start: 0, end: 10, text: "A useful synthetic highlight for the worker proof.", words: [] }] };
  await db.update(cutStudioProjects).set({ transcript }).where(eq(cutStudioProjects.id, project.id));
  const createJob = () => ({ projectId: project.id, ownerUserId: project.ownerUserId, kind: "highlights" as const, state: "queued" as const, detail: "admission proof" });
  const jobs = await db.insert(cutStudioJobs).values(Array.from({ length: 6 }, createJob)).returning();
  const ids = jobs.map((job) => job.id);
  const state = () => db.select().from(cutStudioJobs).where(inArray(cutStudioJobs.id, ids));
  let releaseLock!: () => void, lockReady!: (xid: string) => void;
  const held = new Promise<void>((resolve) => { releaseLock = resolve; });
  const ready = new Promise<string>((resolve) => { lockReady = resolve; });
  // A real row lock holds every admitted SQL claim at the same boundary. Six
  // unique requests must reserve only two slots before that database await.
  const lock = db.transaction(async (transaction) => {
    await transaction.select().from(cutStudioJobs).where(inArray(cutStudioJobs.id, ids)).for("update");
    const rows = await transaction.execute(sql`SELECT pg_current_xact_id()::text AS xid`);
    lockReady(String(rows[0].xid));
    await held;
  });
  const xid = await Promise.race([ready, lock.then(() => { throw new Error("Lock exited before admission proof"); })]);
  const settled: string[] = [];
  const requests = ids.map((id) => processCutStudioJob(id).finally(() => { settled.push(id); }));
  let blockedClaims = 0;
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await db.execute(sql`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'transactionid' AND transactionid::text = ${xid} AND NOT granted`);
      blockedClaims = Number(rows[0].count);
      if (blockedClaims === 2 && settled.length === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blockedClaims, 2, "Only admitted claims may wait on fixture row locks");
    assert.deepEqual(settled.sort(), ids.slice(2).sort(), "Excess work must remain unclaimed");
    const queued = await state();
    assert(queued.every((job) => job.state === "queued" && job.leaseToken === null));
  } finally {
    releaseLock();
    await lock;
    await Promise.all(requests);
  }
  let rows = await state();
  assert.equal(rows.filter((job) => job.state === "done").length, 2);
  assert.equal(rows.filter((job) => job.state === "queued" && job.leaseToken === null).length, 4);
  // Duplicate/completed and missing claims release their reservations too.
  await Promise.all([processCutStudioJob(ids[0]), processCutStudioJob(crypto.randomUUID())]);
  for (const chunk of [ids.slice(2, 4), ids.slice(4, 6)]) await Promise.all(chunk.map(processCutStudioJob));
  rows = await state();
  assert(rows.every((job) => job.state === "done" && job.workerId === identity.id && job.leaseExpiresAt === null));
  assert(rows.every((job) => Array.isArray((job.output as { candidates?: unknown[] })?.candidates)));
  // A genuine processor error must not strand the slot.
  await db.update(cutStudioProjects).set({ transcript: null }).where(eq(cutStudioProjects.id, project.id));
  const [failed] = await db.insert(cutStudioJobs).values(createJob()).returning();
  await processCutStudioJob(failed.id);
  const [failure] = await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, failed.id));
  assert.equal(failure.state, "error");
  assert.equal(failure.errorCode, "transcript_required");
  await db.update(cutStudioProjects).set({ transcript }).where(eq(cutStudioProjects.id, project.id));
  const [afterFailure] = await db.insert(cutStudioJobs).values(createJob()).returning();
  await processCutStudioJob(afterFailure.id);
  assert.equal((await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, afterFailure.id)))[0].state, "done");
  await stopCutStudioProcessing();
  const [drained] = await db.insert(cutStudioJobs).values(createJob()).returning();
  await processCutStudioJob(drained.id);
  const [stillQueued] = await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, drained.id));
  assert.equal(stillQueued.state, "queued");
  assert.equal(stillQueued.leaseToken, null);
  // Existing lease-recovery checks must not accidentally select this fixture.
  await db.delete(cutStudioJobs).where(inArray(cutStudioJobs.id, [...ids, failed.id, afterFailure.id, drained.id]));
  await db.update(cutStudioProjects).set({ transcript: project.transcript }).where(eq(cutStudioProjects.id, project.id));
  return { configuredSlots: 2, blockedClaims, overCapacityUnclaimed: 4, completedAfterReadmission: 6, missingClaimReleased: true, failedClaimReleased: true, drainPreservedQueue: true };
}
