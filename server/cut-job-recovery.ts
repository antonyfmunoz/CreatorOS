import { and, eq, sql } from "drizzle-orm";
import { cutStudioJobs } from "@shared/schema";
import { db } from "./db";

/** One canonical recovery path for the worker tick and owner status polling.
 * Cancellation is terminal; an expired attempt never receives a fresh budget. */
export async function recoverCutJobs(jobId?: string) {
  const now = sql`clock_timestamp() AT TIME ZONE 'UTC'`;
  const cancelled = sql`${cutStudioJobs.cancellationRequestedAt} IS NOT NULL`;
  const exhausted = sql`${cutStudioJobs.attempt} >= ${cutStudioJobs.maxAttempts}`;
  const rows = await db.update(cutStudioJobs).set({
    state: sql`CASE WHEN ${cancelled} THEN 'cancelled' WHEN ${exhausted} THEN 'error' ELSE 'queued' END`,
    detail: sql`CASE WHEN ${cancelled} THEN 'Cancelled by user' WHEN ${exhausted} THEN 'Automatic recovery limit reached. Review the failure before retrying.' ELSE 'Recovering interrupted worker lease' END`,
    errorCode: sql`CASE WHEN ${cancelled} THEN NULL WHEN ${exhausted} THEN 'worker_retry_exhausted' ELSE NULL END`,
    progress: 0, workerId: null, workerRegion: null, leaseToken: null, leaseExpiresAt: null,
    heartbeatAt: null, startedAt: null,
    finishedAt: sql`CASE WHEN ${cancelled} OR ${exhausted} THEN ${now} ELSE NULL END`,
  }).where(and(jobId ? eq(cutStudioJobs.id, jobId) : undefined,
    sql`((${cutStudioJobs.state} = 'running' AND (
      ${cutStudioJobs.leaseExpiresAt} <= (${now}) OR
      (${cutStudioJobs.leaseExpiresAt} IS NULL AND ${cutStudioJobs.startedAt} <= (${now}) - interval '35 minutes')
    )) OR (${cutStudioJobs.state} = 'queued' AND (${cancelled} OR ${exhausted})))`,
  )).returning({ id: cutStudioJobs.id, state: cutStudioJobs.state });
  return rows;
}

/** Repeated clicks on the same failed job resolve to one child job. A failed
 * child may be explicitly retried in turn; it is never an automatic new budget. */
export async function retryCutJob(jobId: string, ownerUserId: number) {
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    // Same owner lock as ordinary and composition-batch render admission.
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cutstudio.render-batch.owner.${ownerUserId}`}))`);
    const [job] = await transaction.select().from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.ownerUserId, ownerUserId))).for("update");
    if (!job) return { status: "not_found" as const };
    if (job.state !== "error") return { status: "not_failed" as const };
    const [existing] = await transaction.select().from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.retryOfJobId, job.id), eq(cutStudioJobs.ownerUserId, ownerUserId)));
    if (existing) return { status: "existing" as const, job: existing };
    const [active] = await transaction.select({ count: sql<number>`count(*)::int` }).from(cutStudioJobs)
      .where(and(eq(cutStudioJobs.ownerUserId, ownerUserId), sql`${cutStudioJobs.state} IN ('queued', 'running')`));
    if (active.count >= 2) return { status: "busy" as const };
    const [retry] = await transaction.insert(cutStudioJobs).values({ projectId: job.projectId, ownerUserId,
      kind: job.kind, request: job.request, retryOfJobId: job.id, detail: "Retry queued" }).returning();
    return { status: "created" as const, job: retry };
  });
}
