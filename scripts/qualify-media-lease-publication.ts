import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { withMediaLeaseWrite } from "../server/media-job-lease";
import { assets, mediaProcessingJobs } from "../shared/schema";

export async function qualifyMediaLeasePublication(asset: typeof assets.$inferSelect) {
  assert.equal(process.env.CREATOROS_QUALIFICATION_MODE, "true");
  assert.equal(process.env.QUALIFICATION_ISOLATED_DATABASE, "true");
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.pathname, "/creativesos_media");
  const token = randomUUID();
  const [job] = await db.insert(mediaProcessingJobs).values({ assetId: asset.id, ownerUserId: asset.ownerUserId,
    kind: "probe", state: "running", leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60_000),
    idempotencyKey: `lease-publication:${randomUUID()}` }).returning();
  const state = async () => (await db.select().from(mediaProcessingJobs).where(eq(mediaProcessingJobs.id, job.id)))[0];
  const claim = { id: job.id, leaseToken: token };
  const fresh = () => new AbortController();
  let writes = 0;
  const write = async (transaction: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    writes += 1;
    await transaction.update(mediaProcessingJobs).set({ output: { publication: writes } }).where(eq(mediaProcessingJobs.id, job.id));
    return writes;
  };
  try {
    assert.equal(await withMediaLeaseWrite(claim, fresh().signal, write), 1);
    await assert.rejects(withMediaLeaseWrite({ ...claim, leaseToken: randomUUID() }, fresh().signal, write), /lease lost/);
    assert.equal(writes, 1);
    const abort = fresh();
    await assert.rejects(withMediaLeaseWrite(claim, abort.signal, async transaction => { await write(transaction); abort.abort(); }));
    assert.deepEqual((await state()).output, { publication: 1 }, "Abort during publication must roll back");
    const preAborted = fresh(); preAborted.abort();
    await assert.rejects(withMediaLeaseWrite(claim, preAborted.signal, write));
    assert.equal(writes, 2);
    await db.update(mediaProcessingJobs).set({ leaseExpiresAt: new Date(Date.now() - 1) }).where(eq(mediaProcessingJobs.id, job.id));
    await assert.rejects(withMediaLeaseWrite(claim, fresh().signal, write), /lease lost/);
    assert.equal(writes, 2);
    const conflicts: string[] = [];
    for (const change of ["cancelled", "reassigned"] as const) {
      await db.update(mediaProcessingJobs).set({ state: "running", leaseToken: token, cancellationRequestedAt: null, leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(mediaProcessingJobs.id, job.id));
      let release!: () => void, ready!: (xid: string) => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const acquired = new Promise<string>(resolve => { ready = resolve; });
      const mutation = db.transaction(async transaction => {
        await transaction.select().from(mediaProcessingJobs).where(eq(mediaProcessingJobs.id, job.id)).for("update");
        await transaction.update(mediaProcessingJobs).set(change === "cancelled"
          ? { state: "cancelled", cancellationRequestedAt: new Date() }
          : { leaseToken: randomUUID() }).where(eq(mediaProcessingJobs.id, job.id));
        const rows = await transaction.execute(sql`SELECT pg_current_xact_id()::text AS xid`);
        ready(String(rows[0].xid)); await held;
      });
      const xid = await Promise.race([acquired, mutation.then(() => { throw new Error("Fixture transaction exited before holding its lock"); })]);
      const outcome = withMediaLeaseWrite(claim, fresh().signal, write)
        .then(() => null, error => error as Error);
      try {
        let blocked = false;
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const locks = await db.execute(sql`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'transactionid' AND transactionid::text = ${xid} AND NOT granted`);
          if (Number(locks[0].count) === 1) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(blocked, true, "Publication must serialize with the exact job's durable mutation");
      } finally {
        release(); await mutation;
        const error = await outcome;
        assert.ok(error instanceof Error);
        assert.match(error.message, /lease lost/);
      }
      assert.equal(writes, 2, "Losing attempts must never invoke a publication write");
      assert.deepEqual((await state()).output, { publication: 1 });
      conflicts.push(change);
    }
    return { liveCommit: true, mismatchedAttemptDenied: true, preAbortDenied: true,
      localAbortRolledBack: true, expiredLeaseDenied: true, realRowLockConflicts: conflicts };
  } finally {
    await db.delete(mediaProcessingJobs).where(eq(mediaProcessingJobs.id, job.id));
  }
}
