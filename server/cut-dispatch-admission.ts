import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cutStudioJobs } from "@shared/schema";
import { db } from "./db";
import { cutCloudDispatchLeaseMs } from "./cut-cloud-client";
import { recoverCutJobs } from "./cut-job-recovery";

/** A request may have reached Cloud Run even when its response is lost. Keep
 * its full reservation on failure; application replicas share one durable cap.
 * This bounds dispatch requests, not billing or the number of rendered jobs. */
export async function claimCutCloudDispatch(jobId: string) {
  await recoverCutJobs(jobId);
  return db.transaction(async transaction => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    const [job] = await transaction.select({ id: cutStudioJobs.id }).from(cutStudioJobs)
      .where(eq(cutStudioJobs.id, jobId)).for("update");
    if (!job) return undefined;
    // Evaluate the database clock only after acquiring the row lock.
    const now = sql`clock_timestamp() AT TIME ZONE 'UTC'`;
    const [claimed] = await transaction.update(cutStudioJobs).set({
      detail: "External worker requested", heartbeatAt: now,
      dispatchAttempt: sql`${cutStudioJobs.dispatchAttempt} + 1`,
      dispatchToken: randomUUID(),
      dispatchExpiresAt: sql`(${now}) + (${cutCloudDispatchLeaseMs} * interval '1 millisecond')`,
    }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "queued"),
      sql`${cutStudioJobs.cancellationRequestedAt} IS NULL`,
      sql`${cutStudioJobs.attempt} < ${cutStudioJobs.maxAttempts}`,
      sql`${cutStudioJobs.dispatchAttempt} < ${cutStudioJobs.maxDispatchAttempts}`,
      sql`(${cutStudioJobs.dispatchExpiresAt} IS NULL OR ${cutStudioJobs.dispatchExpiresAt} <= (${now}))`,
    )).returning({ id: cutStudioJobs.id, token: cutStudioJobs.dispatchToken });
    return claimed;
  });
}

export async function recordCutDispatchUnconfirmed(jobId: string, token: string) {
  const [updated] = await db.update(cutStudioJobs).set({
    detail: "Worker start could not be confirmed. Waiting before a bounded retry.",
  }).where(and(eq(cutStudioJobs.id, jobId), eq(cutStudioJobs.state, "queued"),
    eq(cutStudioJobs.dispatchToken, token), sql`${cutStudioJobs.cancellationRequestedAt} IS NULL`,
    sql`${cutStudioJobs.dispatchExpiresAt} > (clock_timestamp() AT TIME ZONE 'UTC')`,
  )).returning({ id: cutStudioJobs.id });
  return Boolean(updated);
}
