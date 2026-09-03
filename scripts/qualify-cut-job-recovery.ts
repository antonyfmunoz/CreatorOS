import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { recoverCutJobs, retryCutJob } from "../server/cut-job-recovery";
import { renewCutJobLease } from "../server/cut-job-publication";
import { claimCutStudioJob, cutWorkerIdentity, scheduleCutStudioProcessing, stopCutStudioProcessing } from "../server/cut-studio";
import { cutStudioJobs, cutStudioProjects } from "../shared/schema";

export async function qualifyCutJobRecovery(project: typeof cutStudioProjects.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const ids: string[] = [];
  const create = async (extra: Partial<typeof cutStudioJobs.$inferInsert> = {}) => {
    const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: project.ownerUserId,
      kind: "highlights", ...extra }).returning(); ids.push(job.id); return job;
  };
  const state = async (id: string) => (await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, id)))[0];
  const expire = (id: string) => db.update(cutStudioJobs).set({ leaseExpiresAt: new Date(Date.now() - 60_000) }).where(eq(cutStudioJobs.id, id));
  let scheduled = false;
  try {
    const budget = await create();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const token = randomUUID();
      const claimed = await claimCutStudioJob(budget.id, cutWorkerIdentity(), token);
      assert.equal(claimed?.attempt, attempt);
      assert.equal(await renewCutJobLease(budget.id, token, 60_000), true);
      assert.equal((await state(budget.id)).attempt, attempt, "Renewal must not count as a new attempt");
      await expire(budget.id);
      assert.equal((await recoverCutJobs(budget.id)).length, 1);
      const recovered = await state(budget.id);
      assert.equal(recovered.attempt, attempt);
      assert.equal(recovered.state, attempt < 3 ? "queued" : "error");
      assert.equal(recovered.leaseToken, null);
    }
    assert.equal((await state(budget.id)).errorCode, "worker_retry_exhausted");
    assert.equal(await claimCutStudioJob(budget.id, cutWorkerIdentity(), randomUUID()), undefined);
    // An older image that omits the application-level budget predicate must
    // still be stopped by database-owned claim accounting.
    await db.update(cutStudioJobs).set({ state: "queued" }).where(eq(cutStudioJobs.id, budget.id));
    const rejectedClaim = (error: any) => (error?.cause?.code ?? error?.code) === "23514";
    await assert.rejects(db.update(cutStudioJobs).set({ state: "running" }).where(eq(cutStudioJobs.id, budget.id)).execute(), rejectedClaim);
    await recoverCutJobs(budget.id);

    const unrelated = await create({ state: "queued", cancellationRequestedAt: new Date() });
    const cancelled = await create({ state: "running", attempt: 1, leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 1_000), cancellationRequestedAt: new Date() });
    await recoverCutJobs(cancelled.id);
    assert.equal((await state(cancelled.id)).state, "cancelled");
    assert.equal((await state(unrelated.id)).state, "queued", "Scoped recovery must not mutate an unrelated job");
    await recoverCutJobs(unrelated.id);
    assert.equal((await state(unrelated.id)).state, "cancelled");
    await assert.rejects(db.update(cutStudioJobs).set({ state: "queued" }).where(eq(cutStudioJobs.id, cancelled.id))
      .then(() => db.update(cutStudioJobs).set({ state: "running" }).where(eq(cutStudioJobs.id, cancelled.id))), rejectedClaim);
    await recoverCutJobs(cancelled.id);
    const live = await create({ state: "running", attempt: 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) });
    assert.equal((await recoverCutJobs(live.id)).length, 0);
    assert.equal((await state(live.id)).leaseToken, live.leaseToken);
    await db.update(cutStudioJobs).set({ state: "done", leaseExpiresAt: null }).where(eq(cutStudioJobs.id, live.id));
    const legacy = await create({ state: "running", attempt: 1, startedAt: new Date(Date.now() - 36 * 60_000) });
    await recoverCutJobs(legacy.id); assert.equal((await state(legacy.id)).state, "queued");
    await db.update(cutStudioJobs).set({ state: "cancelled" }).where(eq(cutStudioJobs.id, legacy.id));

    assert.equal((await retryCutJob(budget.id, project.ownerUserId + 1_000_000)).status, "not_found");
    assert.equal((await retryCutJob(live.id, project.ownerUserId)).status, "not_failed");
    const results = await Promise.all(Array.from({ length: 8 }, () => retryCutJob(budget.id, project.ownerUserId)));
    assert.equal(results.filter(result => result.status === "created").length, 1);
    assert.equal(results.filter(result => result.status === "existing").length, 7);
    const retryIds = results.flatMap(result => "job" in result && result.job ? [result.job.id] : []);
    assert.equal(new Set(retryIds).size, 1); ids.push(retryIds[0]);
    const retry = await state(retryIds[0]);
    assert.equal(retry.attempt, 0); assert.equal(retry.maxAttempts, 3); assert.equal(retry.retryOfJobId, budget.id);
    assert.deepEqual(retry.request, budget.request);
    const additional = await create();
    const busy = await create({ state: "error" });
    assert.equal((await retryCutJob(busy.id, project.ownerUserId)).status, "busy");
    assert.equal((await retryCutJob(budget.id, project.ownerUserId)).status, "existing", "Replays must not need a new quota slot");
    await db.update(cutStudioJobs).set({ state: "cancelled" }).where(inArray(cutStudioJobs.id, [retry.id, additional.id]));

    // Start the actual scheduler, then introduce a future-expiring lease so its
    // ordinary ten-second tick, not startup recovery, must recover it.
    await db.update(cutStudioProjects).set({ transcript: null }).where(eq(cutStudioProjects.id, project.id));
    scheduleCutStudioProcessing(); scheduled = true;
    const tick = await create({ state: "running", attempt: 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 1_500) });
    const deadline = Date.now() + 18_000;
    let finished = await state(tick.id);
    while (Date.now() < deadline && finished.state !== "error") {
      await new Promise(resolve => setTimeout(resolve, 100)); finished = await state(tick.id);
    }
    assert.equal(finished.state, "error");
    assert.equal(finished.attempt, 2);
    assert.equal(finished.errorCode, "transcript_required", "The ordinary tick must execute the recovered job without a provider call");
    assert.equal((await state(budget.id)).attempt, 3);
    assert.equal((await state(budget.id)).state, "error");
    return { persistentAttemptBudget: 3, renewalDoesNotIncrement: true, legacyClaimGuard: true,
      cancelledNeverResurrected: true, scopedRecovery: true, liveLeasePreserved: true, legacyLeaseRecovery: true,
      duplicateRetryRequests: 8, createdRetryJobs: 1, ownerAndStateChecks: true, quotaReplay: true, ordinaryTickRecovery: true };
  } finally {
    if (scheduled) await stopCutStudioProcessing();
    if (ids.length) await db.delete(cutStudioJobs).where(and(eq(cutStudioJobs.ownerUserId, project.ownerUserId), inArray(cutStudioJobs.id, ids)));
  }
}
