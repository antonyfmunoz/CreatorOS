import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { claimCutCloudDispatch, recordCutDispatchUnconfirmed } from "../server/cut-dispatch-admission";
import { recoverCutJobs, retryCutJob } from "../server/cut-job-recovery";
import { claimCutStudioJob, cutWorkerIdentity } from "../server/cut-studio";
import { cutStudioJobs, cutStudioProjects } from "../shared/schema";

/** Actual PostgreSQL races; no cloud invocation and no production fixtures. */
export async function qualifyCutDispatchBudget(project: typeof cutStudioProjects.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const ids: string[] = [];
  const create = async (extra: Partial<typeof cutStudioJobs.$inferInsert> = {}) => {
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: project.ownerUserId,
      kind: "highlights", ...extra }).returning(); ids.push(job.id); return job;
  };
  const state = async (id: string) => (await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, id)))[0];
  const expire = (id: string) => db.update(cutStudioJobs).set({ dispatchExpiresAt: new Date(Date.now() - 1_000) }).where(eq(cutStudioJobs.id, id));
  try {
    assert.equal(await claimCutCloudDispatch(randomUUID()), undefined);
    const job = await create();
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimCutCloudDispatch(job.id)));
    assert.equal(claims.filter(Boolean).length, 1);
    const first = claims.find(Boolean)!; assert.ok(first.token);
    const admitted = await state(job.id);
    assert.equal(admitted.dispatchAttempt, 1); assert.equal(admitted.attempt, 0);
    assert.ok(admitted.dispatchExpiresAt && admitted.dispatchExpiresAt.getTime() - Date.now() > 29 * 60_000);
    assert.equal(await recordCutDispatchUnconfirmed(job.id, first.token), true);
    assert.equal((await state(job.id)).dispatchExpiresAt?.getTime(), admitted.dispatchExpiresAt?.getTime());
    // A legacy worker's heartbeat clearing cannot erase the new reservation.
    await db.update(cutStudioJobs).set({ heartbeatAt: null }).where(eq(cutStudioJobs.id, job.id));
    assert.equal(await claimCutCloudDispatch(job.id), undefined);
    assert.equal((await recoverCutJobs(job.id)).length, 0);
    for (let attempt = 2; attempt <= 3; attempt++) {
      await expire(job.id);
      const next = await claimCutCloudDispatch(job.id); assert.ok(next?.token);
      assert.notEqual(next.token, first.token);
      assert.equal((await state(job.id)).dispatchAttempt, attempt);
      assert.equal(await recordCutDispatchUnconfirmed(job.id, first.token), false, "Stale response must not overwrite the new reservation");
      assert.equal(await recordCutDispatchUnconfirmed(job.id, next.token), true);
      assert.equal((await recoverCutJobs(job.id)).length, 0, "Final dispatch must retain its cold-start window");
      assert.equal(await claimCutCloudDispatch(job.id), undefined);
    }
    await expire(job.id);
    assert.equal(await claimCutCloudDispatch(job.id), undefined);
    const exhausted = await state(job.id);
    assert.equal(exhausted.state, "error"); assert.equal(exhausted.errorCode, "cloud_dispatch_exhausted");
    assert.equal(exhausted.dispatchAttempt, 3); assert.equal(exhausted.attempt, 0);
    assert.ok(exhausted.finishedAt);
    assert.equal(await claimCutStudioJob(job.id, cutWorkerIdentity(), randomUUID()), undefined);
    const retried = await retryCutJob(job.id, project.ownerUserId);
    assert.equal(retried.status, "created"); assert.ok("job" in retried && retried.job);
    if (!("job" in retried) || !retried.job) throw new Error("Expected explicit retry");
    ids.push(retried.job.id);
    assert.equal(retried.job.dispatchAttempt, 0); assert.equal(retried.job.attempt, 0);
    assert.equal(retried.job.dispatchToken, null); assert.equal(retried.job.dispatchExpiresAt, null);
    await db.update(cutStudioJobs).set({ state: "cancelled" }).where(eq(cutStudioJobs.id, retried.job.id));

    const cancelled = await create(); const cancellationClaim = await claimCutCloudDispatch(cancelled.id); assert.ok(cancellationClaim?.token);
    await db.update(cutStudioJobs).set({ cancellationRequestedAt: new Date() }).where(eq(cutStudioJobs.id, cancelled.id));
    assert.equal(await recordCutDispatchUnconfirmed(cancelled.id, cancellationClaim.token), false);
    assert.equal(await claimCutCloudDispatch(cancelled.id), undefined);
    assert.equal((await state(cancelled.id)).state, "cancelled");
    assert.equal((await state(cancelled.id)).dispatchAttempt, 1);

    const running = await create({ dispatchAttempt: 2 });
    const last = await claimCutCloudDispatch(running.id); assert.ok(last?.token);
    assert.ok(await claimCutStudioJob(running.id, cutWorkerIdentity(), randomUUID()));
    assert.equal(await recordCutDispatchUnconfirmed(running.id, last.token), false);
    await expire(running.id);
    assert.equal((await recoverCutJobs(running.id)).length, 0, "Expired dispatch must not terminate a live worker lease");
    assert.equal((await state(running.id)).state, "running");
    await db.update(cutStudioJobs).set({ leaseExpiresAt: new Date(Date.now() - 1_000) }).where(eq(cutStudioJobs.id, running.id));
    await recoverCutJobs(running.id);
    assert.equal((await state(running.id)).dispatchAttempt, 3, "Worker recovery must not grant new dispatches");
    assert.equal(await claimCutCloudDispatch(running.id), undefined);
    assert.equal((await state(running.id)).errorCode, "cloud_dispatch_exhausted");
    return { concurrentRequests: 8, admittedStarts: 1, dispatchLimit: 3, unknownOutcomeHoldsLease: true,
      legacyHeartbeatIndependent: true, staleResponseFenced: true, finalStartWindowPreserved: true,
      fourthStartRejected: true, cancellationTerminal: true, liveWorkerPreserved: true,
      explicitRetryFreshBudget: true, cloudInvocations: 0 };
  } finally {
    if (ids.length) await db.delete(cutStudioJobs).where(and(eq(cutStudioJobs.ownerUserId, project.ownerUserId), inArray(cutStudioJobs.id, ids)));
  }
}
