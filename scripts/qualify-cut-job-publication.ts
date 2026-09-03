import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { renewCutJobLease, withCutJobLeaseWrite } from "../server/cut-job-publication";
import { claimCutStudioJob, cutWorkerIdentity } from "../server/cut-studio";
import { cutStudioJobs, cutStudioProjects } from "../shared/schema";

/** Real transaction/lock tests; invoked only by the disposable worker suite. */
export async function qualifyCutJobPublication(project: typeof cutStudioProjects.$inferSelect) {
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const token = randomUUID();
  const [job] = await db.insert(cutStudioJobs).values({ projectId: project.id, ownerUserId: project.ownerUserId,
    kind: "render", state: "running", leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60_000) }).returning();
  const state = async () => (await db.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, job.id)))[0];
  const reset = async (leaseExpiresAt = new Date(Date.now() + 60_000)) => {
    await db.update(cutStudioJobs).set({ state: "running", leaseToken: token, cancellationRequestedAt: null,
      leaseExpiresAt, progress: 0, output: {} }).where(eq(cutStudioJobs.id, job.id));
  };
  let writes = 0;
  const write = async (transaction: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    writes++;
    await transaction.update(cutStudioJobs).set({ state: "done", progress: 1, leaseExpiresAt: null,
      output: { publication: writes } }).where(eq(cutStudioJobs.id, job.id));
    return true;
  };
  try {
    assert.equal(await withCutJobLeaseWrite(job.id, token, write), true);
    assert.equal((await state()).state, "done");
    await reset();
    assert.equal(await withCutJobLeaseWrite(job.id, randomUUID(), write), undefined);
    const abort = new AbortController();
    assert.equal(await withCutJobLeaseWrite(job.id, token, async transaction => { await write(transaction); abort.abort(); return true; }, abort.signal), undefined);
    assert.equal((await state()).state, "running");
    assert.deepEqual((await state()).output, {});
    assert.equal(await withCutJobLeaseWrite(job.id, token, write, abort.signal), undefined);
    assert.equal(writes, 2);
    const deliberateFailure = new Error("Synthetic transaction failure");
    await assert.rejects(withCutJobLeaseWrite(job.id, token, async () => { throw deliberateFailure; }), error => error === deliberateFailure);
    const conflicts: string[] = [];
    for (const reason of ["cancelled", "reassigned", "expired"] as const) {
      const expires = new Date(Date.now() + (reason === "expired" ? 1_500 : 60_000));
      await reset(expires);
      let release!: () => void, acquired!: (xid: string) => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<string>(resolve => { acquired = resolve; });
      const blocker = db.transaction(async transaction => {
        await transaction.select().from(cutStudioJobs).where(eq(cutStudioJobs.id, job.id)).for("update");
        // Expiry deliberately leaves the tuple unchanged while holding its lock.
        if (reason !== "expired") await transaction.update(cutStudioJobs).set(reason === "cancelled"
          ? { cancellationRequestedAt: new Date() } : { leaseToken: randomUUID() }).where(eq(cutStudioJobs.id, job.id));
        const rows = await transaction.execute(sql`SELECT pg_current_xact_id()::text AS xid`);
        acquired(String(rows[0].xid)); await held;
      });
      const xid = await Promise.race([ready, blocker.then(() => { throw new Error("Fixture lock exited early"); })]);
      const publication = withCutJobLeaseWrite(job.id, token, write).then(value => ({ value }), error => ({ error }));
      const renewal = renewCutJobLease(job.id, token, 60_000).then(value => ({ value }), error => ({ error }));
      try {
        let blocked = false;
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
          // One waiter may wait on the other row-lock waiter rather than the
          // original transaction, so require real contention, not two xids.
          const rows = await db.execute(sql`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'transactionid' AND transactionid::text = ${xid} AND NOT granted`);
          if (Number(rows[0].count) >= 1) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(blocked, true);
        if (reason === "expired") {
          let expired = false;
          while (Date.now() < deadline) {
            const rows = await db.execute(sql`SELECT clock_timestamp() > ${expires.toISOString()}::timestamptz AS expired`);
            if (rows[0].expired === true) { expired = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          assert.equal(expired, true);
        }
      } finally { release(); await blocker; }
      assert.deepEqual(await publication, { value: undefined });
      assert.deepEqual(await renewal, { value: false });
      assert.equal(writes, 2, "An old attempt must not invoke its terminal writer");
      assert.equal((await state()).state, "running");
      conflicts.push(reason);
    }
    await reset();
    assert.equal(await renewCutJobLease(job.id, token, 60_000), true);
    assert.equal(await renewCutJobLease(job.id, randomUUID(), 60_000), false);
    await db.update(cutStudioJobs).set({ state: "queued", cancellationRequestedAt: new Date() }).where(eq(cutStudioJobs.id, job.id));
    assert.equal(await claimCutStudioJob(job.id, cutWorkerIdentity(), randomUUID()), undefined);
    assert.ok((await state()).cancellationRequestedAt);
    // Even changing the state to done inside the callback must be rolled back
    // if its captured authority expires before commit.
    const expires = new Date(Date.now() + 250);
    await reset(expires);
    assert.equal(await withCutJobLeaseWrite(job.id, token, async transaction => {
      await write(transaction);
      await transaction.execute(sql`SELECT pg_sleep(0.3)`);
      return true;
    }), undefined);
    assert.equal(writes, 3, "The terminal mutation must really execute before expiry rolls it back");
    assert.equal((await state()).state, "running");
    assert.deepEqual((await state()).output, {});
    return { liveTerminalCommit: true, wrongTokenDenied: true, abortRollback: true, preAbortDenied: true,
      databaseErrorsPropagate: true, actualLockConflicts: conflicts, liveRenewal: true,
      cancelledClaimDenied: true, expiredTerminalRollback: true };
  } finally { await db.delete(cutStudioJobs).where(eq(cutStudioJobs.id, job.id)); }
}
